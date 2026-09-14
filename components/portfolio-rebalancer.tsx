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
  Tag,
  Upload,
  Wallet,
} from "lucide-react"
import { PortfolioCalculator } from "@/lib/portfolio-calculator"
import { MoexPriceService, TBankProxyPriceService, type PriceResult } from "@/lib/price-service"
import { AssetValidator } from "@/lib/validator"
import { PortfolioStorage, normalizeAssets } from "@/lib/storage"
import { canAddPortfolio, getRequiredTier, getTierLabel, tierCovers, TIER_MAX_ASSETS } from "@/lib/tariff"
import {
  PRICE_REFRESH_COOLDOWN_SECONDS,
  createEmptyPortfolio,
  type Asset,
  type AssetAnalysis,
  type Group,
  type Page,
  type Portfolio,
  type PortfolioContent,
  type Tier,
} from "@/lib/types"
import { AppHeader } from "./app-header"
import { PortfolioSummary } from "./portfolio-summary"
import { GroupAllocations } from "./group-allocations"
import { AssetTable } from "./asset-table"
import { SettingsPage } from "./settings-page"
import { HomePage } from "./home-page"
import { PortfolioSwitcher } from "./portfolio-switcher"

const DEFAULT_PORTFOLIO: Portfolio = createEmptyPortfolio(1, "Основной")

export function PortfolioRebalancer() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([DEFAULT_PORTFOLIO])
  const [activePortfolioId, setActivePortfolioId] = useState<number>(1)
  const [nextPortfolioId, setNextPortfolioId] = useState<number>(2)
  const [tier, setTier] = useState<Tier>("basic")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [priceRefreshCooldown, setPriceRefreshCooldown] = useState(0)
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Флаг: пропускаем первый авто-save на монтировании, чтобы restore-эффект успел
  // подтянуть сохранённые данные, а запись дефолтного («пустого») состояния не
  // затирала localStorage (иначе портфель терялся бы при перезапуске).
  const skipFirstSaveRef = useRef(true)

  const [additionalCash, setAdditionalCash] = useState(0)

  const [isCalculated, setIsCalculated] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [animationKey, setAnimationKey] = useState(0)
  const [calculatedAnalysis, setCalculatedAnalysis] = useState<AssetAnalysis[] | null>(null)
  const [, setCalculatedSpent] = useState<number | null>(null)
  const [, setCalculatedSales] = useState<number | null>(null)

  const [emptyTargetIds, setEmptyTargetIds] = useState<Set<number>>(() => new Set())
  const [appliedAdjustmentIds, setAppliedAdjustmentIds] = useState<Set<number>>(() => new Set())

  const [activePage, setActivePage] = useState<Page>("home")

  // --- Активный портфель и его содержимое -------------------------------------------------
  const activePortfolio = useMemo(
    () => portfolios.find((p) => p.id === activePortfolioId) ?? portfolios[0] ?? null,
    [portfolios, activePortfolioId],
  )

  const assets = activePortfolio?.assets ?? []
  const nextId = activePortfolio?.nextId ?? 1
  const cashBalance = activePortfolio?.cashBalance ?? 0
  const useGroups = activePortfolio?.useGroups ?? false
  const groups = activePortfolio?.groups ?? []
  const isLocked = activePortfolio?.lockedSnapshot != null

  const lockedRequiredTier = useMemo(() => {
    const snap = activePortfolio?.lockedSnapshot
    return snap ? getRequiredTier(snap.assets, snap.useGroups, snap.groups) : "free"
  }, [activePortfolio])

  const maxAssets = useMemo(() => TIER_MAX_ASSETS[tier], [tier])
  const canAddPortfolioFlag = useMemo(
    () => canAddPortfolio(tier, portfolios.length),
    [tier, portfolios.length],
  )

  const resetCalculation = useCallback(() => {
    setIsCalculated(false)
    setCalculatedAnalysis(null)
    setCalculatedSpent(null)
    setCalculatedSales(null)
  }, [])

  /** Атомарная правка содержимого активного портфеля. */
  const updateActiveContent = useCallback(
    (patch: Partial<PortfolioContent> | ((current: Portfolio) => Portfolio)) => {
      setPortfolios((prev) => {
        const targetId = activePortfolio?.id
        if (targetId == null) return prev
        return prev.map((p) => (p.id === targetId ? (typeof patch === "function" ? patch(p) : { ...p, ...patch }) : p))
      })
    },
    [activePortfolio],
  )

  // --- Cooldown кнопки «Обновить цены» (только «Про») -------------------------------------
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

  // Восстановление данных из localStorage после монтирования. Не читаем window
  // в фазе рендеринга, поэтому сервер и клиент формируют одинаковую разметку
  // и гидратация проходит без ошибок.
  useEffect(() => {
    const saved = PortfolioStorage.load()
    if (!saved) return
    const portfs = (saved.portfolios || []).map((p) => ({
      ...p,
      assets: normalizeAssets(p.assets || []),
      groups: p.groups || [],
    }))
    if (portfs.length === 0) return
    const validActive =
      saved.activePortfolioId != null && portfs.some((p) => p.id === saved.activePortfolioId)
        ? saved.activePortfolioId
        : portfs[0].id
    setPortfolios(portfs)
    setActivePortfolioId(validActive)
    setNextPortfolioId(saved.nextPortfolioId ?? portfs.length + 1)
    setTier(saved.tier ?? "basic")
  }, [])

  // Автоблокировка активного портфеля при несоответствии тарифу: сохраняем снапшот
  // содержимого и очищаем его. Восстановление происходит после оплаты/выбора
  // более высокого тарифа (см. handleTierChange). Остальные портфели не затрагиваются.
  useEffect(() => {
    if (!activePortfolio || isLocked) return
    const required = getRequiredTier(assets, useGroups, groups)
    if (tierCovers(required, tier)) return
    const snap: PortfolioContent = { assets, nextId, cashBalance, useGroups, groups, nextGroupId: activePortfolio.nextGroupId }
    updateActiveContent((p) => ({
      ...p,
      lockedSnapshot: snap,
      assets: [],
      nextId: 1,
      cashBalance: 0,
      useGroups: false,
      groups: [],
      nextGroupId: 1,
    }))
    setAdditionalCash(0)
    setEmptyTargetIds(new Set())
    setAppliedAdjustmentIds(new Set())
    resetCalculation()
    setError(null)
    setNotice(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, useGroups, groups, tier, isLocked, activePortfolio])

  // Авто-save. Пропускаем первый вызов на монтировании, когда restore-эффект ещё
  // подтягивает сохранённые данные (иначе дефолтное состояние затирало бы хранилище).
  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false
      return
    }
    PortfolioStorage.save({ version: 4, tier, nextPortfolioId, activePortfolioId, portfolios })
  }, [tier, nextPortfolioId, activePortfolioId, portfolios])

  const handleUpdateAsset = useCallback(
    (updatedAsset: Asset) => {
      const validation = AssetValidator.validate(updatedAsset, useGroups)
      if (!validation.isValid) {
        setError(validation.errors[0])
        return
      }
      updateActiveContent((p) => {
        const oldAsset = p.assets.find((a) => a.id === updatedAsset.id)
        const updated = p.assets.map((a) => (a.id === updatedAsset.id ? updatedAsset : a))
        if (
          oldAsset &&
          (oldAsset.ticker !== updatedAsset.ticker ||
            oldAsset.targetPercent !== updatedAsset.targetPercent ||
            oldAsset.groupId !== updatedAsset.groupId ||
            oldAsset.lotSize !== updatedAsset.lotSize)
        ) {
          setTimeout(() => resetCalculation(), 0)
        }
        return { ...p, assets: updated }
      })
      setError(null)
    },
    [resetCalculation, useGroups, updateActiveContent],
  )

  const handleAddAsset = useCallback(() => {
    updateActiveContent((p) => ({
      ...p,
      nextId: p.nextId + 1,
      assets: [
        ...p.assets,
        { id: p.nextId, ticker: "", quantity: 0, price: 0, targetPercent: 0, groupId: null, lotSize: 1 },
      ],
    }))
    setError(null)
    resetCalculation()
  }, [resetCalculation, updateActiveContent])

  const handleRemoveAsset = useCallback(
    (id: number) => {
      if (activePortfolio && activePortfolio.assets.length <= 1) return
      updateActiveContent((p) => ({ ...p, assets: p.assets.filter((a) => a.id !== id) }))
      resetCalculation()
    },
    [activePortfolio, resetCalculation, updateActiveContent],
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
      updateActiveContent((p) => ({
        ...p,
        assets: p.assets.map((asset, index) => ({
          ...asset,
          price: prices[index] !== null && prices[index] !== undefined ? (prices[index] as number) : asset.price,
          lotSize: lotSizes[index] != null && (lotSizes[index] as number) >= 1 ? (lotSizes[index] as number) : asset.lotSize || 1,
        })),
      }))
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
  }, [assets, resetCalculation, tier, startPriceRefreshCooldown, updateActiveContent])

  const handleCashBalanceChange = useCallback(
    (value: number) => {
      updateActiveContent((p) => ({ ...p, cashBalance: PortfolioCalculator.floorMoney(value) }))
    },
    [updateActiveContent],
  )

  const handleAddCash = useCallback(() => {
    if (additionalCash > 0) {
      updateActiveContent((p) => ({
        ...p,
        cashBalance: PortfolioCalculator.floorMoney(p.cashBalance + additionalCash),
      }))
      setAdditionalCash(0)
    }
  }, [additionalCash, updateActiveContent])

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
        updateActiveContent((p) => ({
          ...p,
          cashBalance: PortfolioCalculator.floorMoney(p.cashBalance + additionalCash),
        }))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, cashBalance, additionalCash, updateActiveContent])

  const handleTargetEmptyChange = useCallback((id: number, isEmpty: boolean) => {
    setEmptyTargetIds((prev) => {
      const next = new Set(prev)
      if (isEmpty) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleDistributeEvenly = useCallback(() => {
    updateActiveContent((p) => ({
      ...p,
      assets: PortfolioCalculator.distributeTargets(p.assets, emptyTargetIds, useGroups ? p.groups : null),
    }))
  }, [emptyTargetIds, updateActiveContent])

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
      updateActiveContent((p) => ({
        ...p,
        assets: p.assets.map((a) => (a.id === assetId ? { ...a, quantity: Math.round(requiredQuantity) } : a)),
        cashBalance: Math.floor((p.cashBalance - adjustmentValue) * 100) / 100,
      }))
      handleQuantityChanged(assetId)
    },
    [handleQuantityChanged, updateActiveContent],
  )

  const handleUseGroupsChange = useCallback(
    (value: boolean) => {
      updateActiveContent((p) => ({
        ...p,
        useGroups: value,
        assets: value ? p.assets : p.assets.map((a) => ({ ...a, groupId: null })),
      }))
      resetCalculation()
    },
    [resetCalculation, updateActiveContent],
  )

  const handleAddGroup = useCallback(
    (name: string, percent: number, color: string) => {
      updateActiveContent((p) => ({
        ...p,
        nextGroupId: p.nextGroupId + 1,
        groups: [...p.groups, { id: p.nextGroupId, name, percent, color: color || "#94a3b8" }],
      }))
      resetCalculation()
    },
    [resetCalculation, updateActiveContent],
  )

  const handleRemoveGroup = useCallback(
    (id: number) => {
      updateActiveContent((p) => ({
        ...p,
        groups: p.groups.filter((g) => g.id !== id),
        assets: p.assets.map((a) => (a.groupId === id ? { ...a, groupId: null } : a)),
      }))
      resetCalculation()
    },
    [resetCalculation, updateActiveContent],
  )

  const handleApplyAllAdjustments = useCallback(() => {
    const totalAdjustmentValue =
      calculatedAnalysis?.reduce((sum, a) => {
        if (appliedAdjustmentIds.has(a.id)) return sum + a.adjustmentValue
        return sum
      }, 0) || 0
    const totalAdjustmentKopeks = Math.round(totalAdjustmentValue * 100) / 100

    updateActiveContent((p) => ({
      ...p,
      assets: p.assets.map((a) => {
        const aAnalysis = calculatedAnalysis?.find((an) => an.id === a.id)
        if (!aAnalysis || !appliedAdjustmentIds.has(a.id)) return a
        return { ...a, quantity: Math.round(aAnalysis.requiredQuantity) }
      }),
      cashBalance: Math.floor((p.cashBalance - totalAdjustmentKopeks) * 100) / 100,
    }))
    setAppliedAdjustmentIds(new Set())
    resetCalculation()
  }, [calculatedAnalysis, appliedAdjustmentIds, resetCalculation, updateActiveContent])

  // --- Управление портфелями ------------------------------------------------------------
  const handleSelectPortfolio = useCallback((id: number) => {
    setActivePortfolioId(id)
    resetCalculation()
    setError(null)
    setNotice(null)
  }, [resetCalculation])

  const handleAddPortfolio = useCallback(
    (name: string) => {
      if (!canAddPortfolioFlag) return
      const newPortfolio = createEmptyPortfolio(nextPortfolioId, name)
      setPortfolios((prev) => [...prev, newPortfolio])
      setNextPortfolioId((prev) => prev + 1)
      setActivePortfolioId(newPortfolio.id)
      resetCalculation()
      setError(null)
      setNotice(null)
    },
    [canAddPortfolioFlag, nextPortfolioId, resetCalculation],
  )

  const handleRenamePortfolio = useCallback((id: number, name: string) => {
    setPortfolios((prev) => prev.map((p) => (p.id === id ? { ...p, name: name || p.name } : p)))
  }, [])

  const handleDeletePortfolio = useCallback(
    (id: number) => {
      setPortfolios((prev) => {
        const remaining = prev.filter((p) => p.id !== id)
        if (remaining.length === 0) return prev
        return remaining
      })
      setActivePortfolioId((cur) => {
        if (cur !== id) return cur
        const remaining = portfolios.filter((p) => p.id !== id)
        return remaining[0]?.id ?? cur
      })
      resetCalculation()
      setError(null)
      setNotice(null)
    },
    [portfolios, resetCalculation],
  )

  const handleTierChange = useCallback(
    (newTier: Tier) => {
      setTier(newTier)
      // После «оплаты» подписки восстанавливаем заблокированный активный портфель,
      // если выбранный тариф его покрывает.
      const snap = activePortfolio?.lockedSnapshot
      if (snap && tierCovers(lockedRequiredTier, newTier)) {
        updateActiveContent(() => ({
          ...activePortfolio,
          lockedSnapshot: null,
          assets: normalizeAssets(snap.assets),
          nextId: snap.nextId,
          cashBalance: snap.cashBalance ?? 0,
          useGroups: snap.useGroups ?? false,
          groups: snap.groups ?? [],
          nextGroupId: snap.nextGroupId ?? 1,
        }))
        setAdditionalCash(0)
        setAppliedAdjustmentIds(new Set())
        resetCalculation()
        setError(null)
        setNotice(null)
      }
    },
    [activePortfolio, lockedRequiredTier, resetCalculation, updateActiveContent],
  )

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = useCallback(() => {
    if (!activePortfolio) return
    try {
      PortfolioStorage.exportToFile(activePortfolio)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [activePortfolio])

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const data = await PortfolioStorage.importFromFile(file)
        updateActiveContent((p) => ({
          ...p,
          name: data.name || p.name,
          assets: normalizeAssets(data.assets),
          nextId: data.nextId,
          cashBalance: data.cashBalance ?? 0,
          useGroups: data.useGroups ?? false,
          groups: data.groups ?? [],
          nextGroupId: data.nextGroupId ?? 1,
          lockedSnapshot: data.lockedSnapshot ?? null,
        }))
        setAdditionalCash(0)
        setAppliedAdjustmentIds(new Set())
        resetCalculation()
        setError(null)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    },
    [resetCalculation, updateActiveContent],
  )

  const handleReset = useCallback(() => {
    PortfolioStorage.clear()
    const def = createEmptyPortfolio(1, "Основной")
    setPortfolios([def])
    setActivePortfolioId(1)
    setNextPortfolioId(2)
    setTier("basic")
    setAdditionalCash(0)
    setIsCalculated(false)
    setCalculatedAnalysis(null)
    setCalculatedSpent(null)
    setCalculatedSales(null)
    setEmptyTargetIds(new Set())
    setAppliedAdjustmentIds(new Set())
    setError(null)
    setNotice(null)
  }, [])

  // Загружаем цены при первом монтировании.
  useEffect(() => {
    handleRefreshPrices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canCalculate = assets.length > 0 && !isCalculating

  const analysis = useMemo(() => calculatedAnalysis ?? [], [calculatedAnalysis])
  const portfolioValidation = useMemo(
    () => AssetValidator.validatePortfolio(assets, useGroups ? groups : null),
    [assets, useGroups, groups],
  )

  return (
    <div className="min-h-screen bg-background">
      <AppHeader activePage={activePage} onNavigate={setActivePage} tier={tier} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {activePage === "home" ? (
          <HomePage tier={tier} onSelectTier={handleTierChange} onNavigate={setActivePage} />
        ) : activePage === "settings" ? (
          <SettingsPage
            tier={tier}
            onTierChange={handleTierChange}
            useGroups={useGroups}
            onUseGroupsChange={handleUseGroupsChange}
            groups={groups}
            onAddGroup={handleAddGroup}
            onRemoveGroup={handleRemoveGroup}
          />
        ) : (
          <div className="space-y-6">
            <header className="space-y-1">
              <h2 className="text-2xl font-semibold text-foreground">{activePortfolio?.name ?? "Портфель"}</h2>
              <p className="text-sm font-normal text-muted-foreground">
                Держите инвестиционный портфель на целевых долях вместе с Московской биржей.
              </p>
            </header>

            <PortfolioSwitcher
              portfolios={portfolios}
              activePortfolioId={activePortfolioId}
              canAdd={canAddPortfolioFlag}
              onSelect={handleSelectPortfolio}
              onAdd={handleAddPortfolio}
              onRename={handleRenamePortfolio}
              onDelete={handleDeletePortfolio}
            />

            {isLocked && (
              <div className="flex flex-col gap-3 rounded-2xl border border-accent-foreground/20 bg-accent px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-foreground/10 text-accent-foreground">
                    <Lock className="h-4 w-4" strokeWidth={2.25} />
                  </span>
                  <p className="text-sm text-accent-foreground text-pretty">
                    Ваш портфель соответствует тарифу <strong className="font-medium">{getTierLabel(lockedRequiredTier)}</strong>.
                    Будет доступен после оплаты подписки.
                  </p>
                </div>
                <button
                  onClick={() => setActivePage("home")}
                  className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-all hover:opacity-90 active:scale-95 sm:self-center"
                >
                  <Tag className="h-4 w-4" strokeWidth={2.25} />
                  Перейти к тарифам
                </button>
              </div>
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
                <p className="mt-1 max-w-xs text-xs font-normal text-muted-foreground text-pretty">
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
              <p className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
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
  children,
}: {
  tone: "negative" | "warning" | "info"
  icon: React.ReactNode
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
      <p className="text-pretty">{children}</p>
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