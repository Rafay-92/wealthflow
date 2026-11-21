import { describe, expect, it } from 'vitest'
import { SAMPLE_TRANSACTIONS } from '../../data/sampleData'
import { buildMonthlyReport } from './monthlyReport'
import { createReportPdf, pdfSafe } from './reportPdf'

describe('pdfSafe', () => {
  it('keeps characters the PDF fonts support', () => {
    expect(pdfSafe('Café – “quoted” · €5 …')).toBe('Café – “quoted” · €5 …')
  })

  it('replaces ones they cannot draw', () => {
    expect(pdfSafe('−5 → 6 ✓')).toBe('-5 -> 6 ?')
  })
})

describe('createReportPdf', () => {
  const report = buildMonthlyReport(SAMPLE_TRANSACTIONS, '2026-10', '2026-11-20')
  const doc = createReportPdf(report, { isSample: true, generatedAt: new Date('2026-11-21T12:00:00Z') })
  // jsPDF doesn't compress by default, so the text is readable in the raw output.
  const raw = doc.output()

  it('produces a valid PDF', () => {
    expect(raw.startsWith('%PDF-')).toBe(true)
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })

  it('contains the report’s key figures and sections', () => {
    expect(raw).toContain('Monthly report')
    expect(raw).toContain('Fictional sample data')
    expect(raw).toContain('Key observations')
    expect(raw).toContain('Recurring payments')
    expect(raw).toContain(report.categories[0]!.category)
  })

  it('numbers every page', () => {
    const pages = doc.getNumberOfPages()
    expect(raw).toContain(`Page ${pages} of ${pages}`)
  })
})
