"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Clock,
  Download,
  Info,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Upload,
  Wallet,
} from "lucide-react"
import { PortfolioCalculator } from "@/lib/portfolio-calculator"
import { MoexPriceService, TBankProxyPriceService, type PriceResult } from "@/lib/price-service"
import { AssetValidator } from "@/lib/validator"
import { PortfolioStorage, normalizeAssets } from "@/lib/storage"
import {
  MAX_ASSETS_FREE,
  MAX_ASSETS_PAID,
  buildLockMessage,
  computeRequiredTier,
  decideLockState,
  isTierSufficient,
  type LockedPortfolioInfo,
} from "@/lib/portfolio-tier"
import { AuthService } from "@/lib/auth-service"
import { createClient } from "@/lib/supabase/client"
import {
  PRICE_REFRESH_COOLDOWN_SECONDS,
  type Asset,
  type AssetAnalysis,
  type AuthUser,
  type Group,
  type Page,
  type PortfolioData,
  type RebalancerServerProps,
  type Tier,
} from "@/lib/types"
import { AppHeader } from "./app-header"
import { PortfolioSummary } from "./portfolio-summary"
import { GroupAllocations } from "./group-allocations"
import { AssetTable } from "./asset-table"
import { SettingsPage } from "./settings-page"
import { TariffsPage } from "./tariffs-page"

export function PortfolioRebalancer({ initialUser, initialTier }: RebalancerServerProps) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [priceRefreshCooldown, setPriceRefreshCooldown] = useState(0)
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Флаг: пропускаем первый авто-save на монтировании, чтобы restore-эффект успел
  // подтянуть сохранённые данные, а запись дефолтного («пустого») состояния не
  // затирала localStorage (иначе портфель терялся бы при перезапуске).
  const skipFirstSaveRef = useRef(true)

  const [nextId, setNextId] = useState<number>(1)
  const [cashBalance, setCashBalance] = useState<number>(0)
  const [additionalCash, setAdditionalCash] = useState(0)

  const [isCalculated, setIsCalculated] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [animationKey, setAnimationKey] = useState(0)
  const [calculatedAnalysis, setCalculatedAnalysis] = useState<AssetAnalysis[] | null>(null)
  const [, setCalculatedSpent] = useState<number | null>(null)
  const [, setCalculatedSales] = useState<number | null>(null)

  const [emptyTargetIds, setEmptyTargetIds] = useState<Set<number>>(() => new Set())
  const [appliedAdjustmentIds, setAppliedAdjustmentIds] = useState<Set<number>>(() => new Set())

  const [activePage, setActivePage] = useState<Page>("portfolio")
  const [tier, setTier] = useState<Tier>(initialTier)
  const [user, setUser] = useState<AuthUser | null>(initialUser)
  const [useGroups, setUseGroups] = useState<boolean>(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [nextGroupId, setNextGroupId] = useState<number>(1)
  // Флаг: восстановление из localStorage завершено — guard тарифа начинает работать.
  const [hydrated, setHydrated] = useState(false)
  // Припаркованный из-за несоответствия тарифу портфель (показываем баннер).
  const [lock, setLock] = useState<LockedPortfolioInfo | null>(null)

  const maxAssets = useMemo(() => (tier === "free" ? MAX_ASSETS_FREE : MAX_ASSETS_PAID), [tier])

  // Восстановление данных из localStorage после монтирования. Не читаем window
  // в фазе рендеринга, поэтому сервер и клиент формируют одинаковую разметку
  // и гидратация проходит без ошибок. Тариф из localStorage не читается:
  // он назначается вручную в БД либо равен 'free' для гостей.
  useEffect(() => {
    const saved = PortfolioStorage.load()
    if (saved) {
      setAssets(normalizeAssets(saved.assets || []))
      setNextId(saved.nextId)
      setCashBalance(saved.cashBalance)
      setUseGroups(saved.useGroups)
      setGroups(saved.groups)
      setNextGroupId(saved.nextGroupId)
    }
    // Гидратация завершена — guard соответствия тарифу может работать.
    setHydrated(true)
  }, [])

  // Синхронизация сессии с сервером: вход/выход/обновление пользователя
  // в другой вкладке или после PKCE-подтверждения email отражаются мгновенно.
  useEffect(() => {
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        const {
          data: { user: sessionUser },
        } = await supabase.auth.getUser()
        setUser(sessionUser ? { id: sessionUser.id, email: sessionUser.email ?? null } : null)
        setTier(await AuthService.getTier(supabase))
      } else if (event === "SIGNED_OUT") {
        setUser(null)
        setTier("free")
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Группы доступны только на тарифе «Про»: гарантия после авторизации/смены тарифа.
  useEffect(() => {
    if (tier !== "pro" && useGroups) {
      setUseGroups(false)
    }
  }, [tier, useGroups])

  const handleSignOut = useCallback(async () => {
    try {
      await AuthService.signOut(createClient())
    } catch {
      // Подписка onAuthStateChange сбросит состояние даже при сетевой ошибке.
    }
  }, [])

  const analysis = useMemo(() => calculatedAnalysis ?? [], [calculatedAnalysis])
  const portfolioValidation = useMemo(
    () => AssetValidator.validatePortfolio(assets, useGroups ? groups : null),
    [assets, useGroups, groups],
  )

  const resetCalculation = useCallback(() => {
    setIsCalculated(false)
    setCalculatedAnalysis(null)
    setCalculatedSpent(null)
    setCalculatedSales(null)
  }, [])

  /** Применить полный снимок портфеля (восстановление из резервной копии / импорт). */
  const applyPortfolioData = useCallback(
    (data: PortfolioData) => {
      setAssets(normalizeAssets(data.assets))
      setNextId(data.nextId)
      setCashBalance(data.cashBalance ?? 0)
      // Тариф из данных не применяется: он назначается вручную в БД либо равен 'free'.
      setUseGroups(data.useGroups ?? false)
      setGroups(data.groups ?? [])
      setNextGroupId(data.nextGroupId ?? 1)
      setAdditionalCash(0)
      setAppliedAdjustmentIds(new Set())
      resetCalculation()
      setError(null)
    },
    [resetCalculation],
  )

  /** Сбросить рабочий стол к пустому состоянию (без очистки localStorage). */
  const resetWorkspace = useCallback(() => {
    setAssets([])
    setNextId(1)
    setCashBalance(0)
    setAdditionalCash(0)
    setUseGroups(false)
    setGroups([])
    setNextGroupId(1)
    setIsCalculated(false)
    setCalculatedAnalysis(null)
    setCalculatedSpent(null)
    setCalculatedSales(null)
    setEmptyTargetIds(new Set())
    setAppliedAdjustmentIds(new Set())
    setError(null)
  }, [resetCalculation])

  // Контроль соответствия портфеля тарифу. Начинает работать после гидратации
  // из localStorage (hydrated), чтобы не «парковать» пустой рабочий стол.
  // Срабатывает на смену тарифа (auth-события SIGNED_IN/USER_UPDATED, выход,
  // перезагрузка) и на любые изменения портфеля.
  useEffect(() => {
    if (!hydrated) return

    const currentPortfolio: PortfolioData = {
      assets,
      nextId,
      cashBalance,
      tier,
      useGroups,
      groups,
      nextGroupId,
    }
    const backup = PortfolioStorage.loadLocked()
    const decision = decideLockState({ tier, current: currentPortfolio, backup })

    if (decision.action === "park") {
      // Портфель не соответствует тарифу — сохраняем «прошлый портфель»
      // в резервную копию и сбрасываем рабочий стол (приложение остаётся
      // полностью рабочим в рамках текущего тарифа).
      PortfolioStorage.saveLocked(currentPortfolio)
      resetWorkspace()
      setLock({ requiredTier: decision.requiredTier })
    } else if (decision.action === "reset-excess") {
      // Резервная копия уже есть — существующую НЕ затираем, только сбрасываем.
      resetWorkspace()
      setLock({ requiredTier: decision.requiredTier })
    } else if (decision.action === "restore") {
      // Тариф стал достаточным — восстанавливаем «прошлый портфель»,
      // затирая текущий рабочий портфель.
      applyPortfolioData(decision.backup)
      PortfolioStorage.clearLocked()
      setLock(null)
    } else if (backup) {
      // Резервная копия существует, но тариф её не покрывает — держим баннер.
      const requiredTier = computeRequiredTier(backup)
      setLock(isTierSufficient(requiredTier, tier) ? null : { requiredTier })
    }
    // Портфель соответствует тарифу и резервной копии нет — баннер не показываем.
  }, [hydrated, tier, assets, nextId, cashBalance, useGroups, groups, nextGroupId, applyPortfolioData, resetWorkspace])

  const startPriceRefreshCooldown = useCallback(() => {
    if (tier !== "pro") return
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    setPriceRefreshCooldown(PRICE_REFRESH_COOLDOWN_SECONDS)
    cooldownTimerRef.current = setInterval(() => {
      setPriceRefreshCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
          cooldownTimerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [tier])

  useEffect(
    () => () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (tier !== "pro" && priceRefreshCooldown > 0) {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
      cooldownTimerRef.current = null
      setPriceRefreshCooldown(0)
    }
  }, [tier, priceRefreshCooldown])

  const handleUpdateAsset = useCallback(
    (updatedAsset: Asset) => {
      const validation = AssetValidator.validate(updatedAsset, useGroups)
      if (!validation.isValid) {
        setError(validation.errors[0])
        return
      }
      setAssets((prevAssets) => {
        const oldAsset = prevAssets.find((a) => a.id === updatedAsset.id)
        const updated = prevAssets.map((a) => (a.id === updatedAsset.id ? updatedAsset : a))
        if (
          oldAsset &&
          (oldAsset.ticker !== updatedAsset.ticker ||
            oldAsset.targetPercent !== updatedAsset.targetPercent ||
            oldAsset.groupId !== updatedAsset.groupId ||
            oldAsset.lotSize !== updatedAsset.lotSize)
        ) {
          setTimeout(() => resetCalculation(), 0)
        }
        return updated
      })
      setError(null)
    },
    [resetCalculation, useGroups],
  )

  const handleAddAsset = useCallback(() => {
    setNextId((prev) => prev + 1)
    setAssets((prevAssets) => [
      ...prevAssets,
      { id: nextId, ticker: "", quantity: 0, price: 0, targetPercent: 0, groupId: null, lotSize: 1 },
    ])
    setError(null)
    resetCalculation()
  }, [nextId, resetCalculation])

  const handleRemoveAsset = useCallback(
    (id: number) => {
      if (assets.length <= 1) return
      setAssets((prevAssets) => prevAssets.filter((a) => a.id !== id))
      resetCalculation()
    },
    [assets.length, resetCalculation],
  )

  const handleRefreshPrices = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const tickers = assets.map((a) => a.ticker).filter((t) => t)
      if (tickers.length === 0) {
        setLoading(false)
        return
      }
      let fetched: PriceResult
      let usedFallback = false
      if (tier === "pro") {
        let tbankResult: PriceResult | null = null
        try {
          tbankResult = await TBankProxyPriceService.fetchPrices(tickers)
        } catch {
          tbankResult = null
        }
        const hasTbankPrices =
          tbankResult && Array.isArray(tbankResult.prices) && tbankResult.prices.some((p) => p != null)
        if (hasTbankPrices && tbankResult) {
          fetched = tbankResult
        } else {
          usedFallback = true
          fetched = await MoexPriceService.fetchPrices(tickers)
        }
      } else {
        fetched = await MoexPriceService.fetchPrices(tickers)
      }
      const { prices, lotSizes, errors } = fetched
      setAssets((prevAssets) =>
        prevAssets.map((asset, index) => ({
          ...asset,
          price: prices[index] !== null && prices[index] !== undefined ? (prices[index] as number) : asset.price,
          lotSize: lotSizes[index] != null && (lotSizes[index] as number) >= 1 ? (lotSizes[index] as number) : asset.lotSize || 1,
        })),
      )
      if (usedFallback) {
        setNotice("Актуальные цены недоступны, данные обновляются с задержкой 15 минут")
      } else if (errors.length > 0) {
        setError(`Не удалось загрузить: ${errors.join("; ")}`)
      }
      resetCalculation()
      startPriceRefreshCooldown()
    } catch (err) {
      setError(`Ошибка получения цен: ${(err as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [assets, resetCalculation, tier, startPriceRefreshCooldown])

  const handleCashBalanceChange = useCallback((value: number) => {
    setCashBalance(PortfolioCalculator.floorMoney(value))
  }, [])

  const handleAddCash = useCallback((amount: number) => {
    if (amount > 0) {
      setCashBalance((prev) => PortfolioCalculator.floorMoney(prev + amount))
      setAdditionalCash(0)
    }
  }, [])

  const handleCalculate = useCallback(() => {
    setIsCalculating(true)
    const totalPortfolio = PortfolioCalculator.calculateTotalValue(assets)
    const effectiveTotalValue = totalPortfolio + cashBalance + additionalCash
    const budget = cashBalance + additionalCash

    setTimeout(() => {
      const { analysis: rawAnalysis, cashSpent, salesTotal } = PortfolioCalculator.analyzePortfolio(
        assets,
        effectiveTotalValue,
        budget,
        useGroups ? groups : null,
      )
      if (additionalCash > 0) {
        setCashBalance((prev) => PortfolioCalculator.floorMoney(prev + additionalCash))
        setAdditionalCash(0)
      }
      setCalculatedSpent(cashSpent)
      setCalculatedSales(salesTotal)
      setCalculatedAnalysis(rawAnalysis)
      setAppliedAdjustmentIds(new Set(assets.map((a) => a.id)))
      setIsCalculated(true)
      setIsCalculating(false)
      setAnimationKey((prev) => prev + 1)
      setTimeout(() => setIsCalculated(false), 2000)
    }, 400)
  }, [assets, cashBalance, additionalCash, useGroups, groups])

  const handleTargetEmptyChange = useCallback((id: number, isEmpty: boolean) => {
    setEmptyTargetIds((prev) => {
      const next = new Set(prev)
      if (isEmpty) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleDistributeEvenly = useCallback(() => {
    setAssets((prevAssets) => PortfolioCalculator.distributeTargets(prevAssets, emptyTargetIds, useGroups ? groups : null))
  }, [emptyTargetIds, useGroups, groups])

  // Определяем handleQuantityChanged ДО потребителя, чтобы избежать TDZ в ES-модулях.
  const handleQuantityChanged = useCallback((id: number) => {
    setAppliedAdjustmentIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const handleApplySingleAdjustment = useCallback(
    (assetId: number, requiredQuantity: number, adjustmentValue: number) => {
      setAssets((prevAssets) =>
        prevAssets.map((a) => (a.id === assetId ? { ...a, quantity: Math.round(requiredQuantity) } : a)),
      )
      setCashBalance((prev) => {
        const newBalance = prev - adjustmentValue
        return Math.floor(newBalance * 100) / 100
      })
      handleQuantityChanged(assetId)
    },
    [handleQuantityChanged],
  )

  const handleUseGroupsChange = useCallback(
    (value: boolean) => {
      setUseGroups(value)
      if (!value) {
        setAssets((prevAssets) => prevAssets.map((a) => ({ ...a, groupId: null })))
      }
      resetCalculation()
    },
    [resetCalculation],
  )

  const handleAddGroup = useCallback(
    (name: string, percent: number, color: string) => {
      setNextGroupId((prev) => prev + 1)
      setGroups((prevGroups) => [...prevGroups, { id: nextGroupId, name, percent, color: color || "#94a3b8" }])
      resetCalculation()
    },
    [nextGroupId, resetCalculation],
  )

  const handleApplyAllAdjustments = useCallback(() => {
    const totalAdjustmentValue =
      calculatedAnalysis?.reduce((sum, a) => {
        if (appliedAdjustmentIds.has(a.id)) return sum + a.adjustmentValue
        return sum
      }, 0) || 0
    const totalAdjustmentKopeks = Math.round(totalAdjustmentValue * 100) / 100

    setAssets((prevAssets) =>
      prevAssets.map((a) => {
        const aAnalysis = calculatedAnalysis?.find((an) => an.id === a.id)
        if (!aAnalysis || !appliedAdjustmentIds.has(a.id)) return a
        return { ...a, quantity: Math.round(aAnalysis.requiredQuantity) }
      }),
    )
    setCashBalance((prev) => {
      const newBalance = prev - totalAdjustmentKopeks
      return Math.floor(newBalance * 100) / 100
    })
    setAppliedAdjustmentIds(new Set())
    resetCalculation()
  }, [calculatedAnalysis, appliedAdjustmentIds, resetCalculation])

  const handleRemoveGroup = useCallback(
    (id: number) => {
      setGroups((prevGroups) => prevGroups.filter((g) => g.id !== id))
      setAssets((prevAssets) => prevAssets.map((a) => (a.groupId === id ? { ...a, groupId: null } : a)))
      resetCalculation()
    },
    [resetCalculation],
  )

  useEffect(() => {
    // Пропускаем первый вызов на монтировании: в этот момент restore-эффект ещё
    // подтягивает сохранённые данные из localStorage. Запись дефолтного («пустого»)
    // состояния в этот момент затирала бы хранилище, и портфель терялся бы
    // при перезапуске. Сохранение начнёт срабатывать со следующего изменения.
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false
      return
    }
    PortfolioStorage.save({ assets, nextId, cashBalance, tier, useGroups, groups, nextGroupId })
  }, [assets, nextId, cashBalance, tier, useGroups, groups, nextGroupId])

  // Загружаем цены при первом монтировании.
  useEffect(() => {
    handleRefreshPrices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = useCallback(() => {
    try {
      PortfolioStorage.exportToFile({ assets, nextId, cashBalance, tier, useGroups, groups, nextGroupId })
    } catch (err) {
      setError((err as Error).message)
    }
  }, [assets, nextId, cashBalance, tier, useGroups, groups, nextGroupId])

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const data = await PortfolioStorage.importFromFile(file)
        applyPortfolioData(data)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    },
    [applyPortfolioData],
  )

  const handleReset = useCallback(() => {
    PortfolioStorage.clear()
    // Резервная копия («прошлый портфель») при сбросе не удаляется: она живёт
    // до восстановления портфеля или перезаписи при следующей парковке.
    resetWorkspace()
  }, [resetWorkspace])

  const canCalculate = assets.length > 0 && !isCalculating

  return (
    <div className="min-h-screen bg-background">
      <AppHeader activePage={activePage} onNavigate={setActivePage} tier={tier} user={user} onSignOut={handleSignOut} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {activePage === "settings" ? (
          <SettingsPage
            tier={tier}
            useGroups={useGroups}
            onUseGroupsChange={handleUseGroupsChange}
            groups={groups}
            onAddGroup={handleAddGroup}
            onRemoveGroup={handleRemoveGroup}
          />
        ) : activePage === "tariffs" ? (
          <TariffsPage tier={tier} />
        ) : (
          <div className="space-y-6">
            {lock && (
              <Banner
                tone="warning"
                icon={<Lock className="h-4 w-4" />}
                action={
                  // Заглушка системы оплаты: кнопка пока ведёт на страницу тарифов,
                  // где сообщается, что тариф назначается вручную.
                  <button
                    type="button"
                    onClick={() => setActivePage("tariffs")}
                    className="shrink-0 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:opacity-90 active:scale-95"
                  >
                    Оплатить подписку
                  </button>
                }
              >
                {buildLockMessage(lock.requiredTier)}
              </Banner>
            )}

            <PortfolioSummary
              analysis={analysis}
              assets={assets}
              cashBalance={cashBalance}
              onCashBalanceChange={handleCashBalanceChange}
              additionalCash={additionalCash}
              onAdditionalCashChange={setAdditionalCash}
              onAddCash={handleAddCash}
            />

            {error && <Banner tone="negative" icon={<AlertTriangle className="h-4 w-4" />}>{error}</Banner>}
            {notice && <Banner tone="warning" icon={<Clock className="h-4 w-4" />}>{notice}</Banner>}

            {useGroups && groups.length > 0 && <GroupAllocations groups={groups} assets={assets} />}

            {assets.length > 0 ? (
              <>
                <AssetTable
                  assets={assets}
                  analysis={analysis}
                  useGroups={useGroups}
                  groups={groups}
                  loading={loading}
                  animationKey={animationKey}
                  isCalculated={isCalculated}
                  appliedAdjustmentIds={appliedAdjustmentIds}
                  onUpdate={handleUpdateAsset}
                  onRemove={handleRemoveAsset}
                  onDistributeEvenly={handleDistributeEvenly}
                  onTargetEmptyChange={handleTargetEmptyChange}
                  onQuantityChanged={handleQuantityChanged}
                  onApplyAdjustment={handleApplySingleAdjustment}
                  onApplyAll={handleApplyAllAdjustments}
                />

                {portfolioValidation.shouldShow && !portfolioValidation.isValid && (
                  <Banner tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
                    {portfolioValidation.error}
                  </Banner>
                )}

                {!isCalculated && (
                  <Banner tone="info" icon={<Info className="h-4 w-4" />}>
                    Нажмите <strong className="font-semibold">«Рассчитать»</strong> для выполнения ребалансировки.
                  </Banner>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <Wallet className="h-7 w-7" strokeWidth={1.75} />
                </span>
                <h3 className="text-base font-semibold text-foreground">Портфель пуст</h3>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground text-pretty">
                  Добавьте активы Московской биржи, чтобы рассчитать ребалансировку.
                </p>
                <button
                  onClick={handleAddAsset}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:opacity-90 active:scale-95"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                  Добавить актив
                </button>
              </div>
            )}

            {/* Основные действия */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleCalculate}
                disabled={!canCalculate}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 sm:flex-none ${
                  isCalculating
                    ? "animate-pulse-glow cursor-wait bg-primary text-primary-foreground"
                    : isCalculated
                      ? "bg-positive text-positive-foreground shadow-sm"
                      : canCalculate
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30 hover:opacity-90 active:scale-95"
                        : "cursor-not-allowed bg-muted text-muted-foreground"
                }`}
              >
                {isCalculating ? (
                  <Loader2 className="h-4 w-4 animate-spin-calc" strokeWidth={2.25} />
                ) : isCalculated ? (
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
                ) : (
                  <Calculator className="h-4 w-4" strokeWidth={2.25} />
                )}
                {isCalculating ? "Расчёт…" : isCalculated ? "Рассчитано" : "Рассчитать"}
              </button>

              <button
                onClick={handleRefreshPrices}
                disabled={loading || assets.filter((a) => a.ticker).length === 0 || priceRefreshCooldown > 0}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin-calc" : ""}`} strokeWidth={2} />
                {loading
                  ? "Загрузка…"
                  : priceRefreshCooldown > 0
                    ? `Обновить (${priceRefreshCooldown} с)`
                    : "Обновить цены"}
              </button>

              <button
                onClick={handleAddAsset}
                disabled={assets.length >= maxAssets}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
              >
                <Plus className="h-4 w-4" strokeWidth={2.25} />
                Добавить актив
                <span className="font-mono text-xs text-muted-foreground">
                  {assets.length}/{maxAssets}
                </span>
              </button>
            </div>

            {/* Файловые действия */}
            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row">
              <button
                onClick={handleExport}
                disabled={assets.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-4 w-4" strokeWidth={2} />
                Сохранить в файл
              </button>
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Upload className="h-4 w-4" strokeWidth={2} />
                Загрузить из файла
                <input type="file" ref={fileInputRef} accept=".json" onChange={handleImport} className="hidden" />
              </label>
              <button
                onClick={handleReset}
                disabled={assets.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-negative-muted hover:text-negative disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={2} />
                Сбросить всё
              </button>
            </div>

            {/* Как использовать */}
            <div className="rounded-2xl border border-border bg-muted/30 p-5">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Info className="h-4 w-4 text-primary" strokeWidth={2} />
                Как использовать
              </p>
              <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <HelpItem>
                  Введите тикер и нажмите <strong className="font-medium text-foreground">Обновить цены</strong> для
                  загрузки котировок.
                </HelpItem>
                <HelpItem>Установите целевой процент для каждого актива (сумма 100%).</HelpItem>
                <HelpItem>
                  Добавьте деньги в карточке <strong className="font-medium text-foreground">Свободные деньги</strong> —
                  остаток сохраняется.
                </HelpItem>
                <HelpItem>
                  Нажмите <strong className="font-medium text-foreground">«Рассчитать»</strong> для расчёта
                  ребалансировки.
                </HelpItem>
                <HelpItem>
                  Колонка <strong className="font-medium text-foreground">Купить/Продать</strong>: зелёный «+» —
                  докупить, красный «−» — продать.
                </HelpItem>
                <HelpItem>
                  Кнопка <strong className="font-medium text-foreground">«Ко всем»</strong> обновляет количество всех
                  активов до требуемого.
                </HelpItem>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function Banner({
  tone,
  icon,
  action,
  children,
}: {
  tone: "negative" | "warning" | "info"
  icon: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const styles = {
    negative: "border-negative/25 bg-negative-muted text-negative",
    warning: "border-accent-foreground/20 bg-accent text-accent-foreground",
    info: "border-info/20 bg-info-muted text-info",
  }[tone]
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="flex-1 text-pretty">{children}</p>
      {action ? <span className="mt-0.5 shrink-0">{action}</span> : null}
    </div>
  )
}

function HelpItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
      <span className="text-pretty leading-relaxed">{children}</span>
    </li>
  )
}
