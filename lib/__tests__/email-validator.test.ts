import { describe, expect, it } from "vitest"
import { EMAIL_MAX_LENGTH, isValidEmail } from "../email-validator"

describe("isValidEmail", () => {
  it("принимает корректные адреса", () => {
    const valid = [
      "user@example.com",
      "first.last@example.com",
      "user+tag@example.com",
      "name@sub.domain.co",
      "a@b.co",
      "u123@mail.example.org",
    ]
    for (const email of valid) {
      expect(isValidEmail(email), email).toBe(true)
    }
  })

  it("принимает адрес с пробелами вокруг (trim)", () => {
    expect(isValidEmail("  user@example.com  ")).toBe(true)
  })

  it("отклоняет адреса без @", () => {
    expect(isValidEmail("userexample.com")).toBe(false)
  })

  it("отклоняет адреса с несколькими @", () => {
    expect(isValidEmail("a@@b.com")).toBe(false)
    expect(isValidEmail("a@b@c.com")).toBe(false)
  })

  it("отклоняет пустые строки и пробелы", () => {
    expect(isValidEmail("")).toBe(false)
    expect(isValidEmail("   ")).toBe(false)
  })

  it("отклоняет адреса с пробелами внутри", () => {
    expect(isValidEmail("user @example.com")).toBe(false)
    expect(isValidEmail("user@ example.com")).toBe(false)
  })

  it("отклоняет адреса без точки в домене", () => {
    expect(isValidEmail("user@example")).toBe(false)
  })

  it("отклоняет TLD короче двух символов", () => {
    expect(isValidEmail("user@example.c")).toBe(false)
  })

  it("отклоняет адреса без локальной части", () => {
    expect(isValidEmail("@example.com")).toBe(false)
  })

  it("отклоняет слишком длинные адреса (>254)", () => {
    const local = "a".repeat(64)
    const domain = "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(63)
    expect(isValidEmail(`${local}@${domain}`)).toBe(false)
    expect(isValidEmail(`${"a".repeat(246)}@b.co`)).toBe(false)
    expect(EMAIL_MAX_LENGTH).toBe(254)
  })
})