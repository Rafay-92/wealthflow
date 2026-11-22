/**
 * Turns a MonthlyReport into a real PDF (selectable text, not a screenshot),
 * entirely in the browser with jsPDF. Nothing is uploaded anywhere.
 *
 * This module is loaded on demand with `import()` when you click Export, so
 * the PDF library doesn't slow down the rest of the app.
 */
import { jsPDF } from 'jspdf'
import { autoTable, type CellHookData } from 'jspdf-autotable'
import { moneyChange, pointsChange, type Change } from '../analytics/change'
import { formatDay, formatMonth } from '../dates'
import { formatCents, formatPercent } from '../money'
import type { MonthlyReport, Observation } from './monthlyReport'
import { OPENING_SOURCE_LABEL } from '../balances/reconcile'

type RGB = [number, number, number]

// A print palette: dark text on white, with darker greens/reds than the
// on-screen theme so they stay readable on paper.
const INK: RGB = [17, 24, 39]
const MUTED: RGB = [100, 112, 133]
const FAINT: RGB = [148, 160, 180]
const RULE: RGB = [226, 232, 240]
const NAVY: RGB = [11, 20, 38]
const ACCENT: RGB = [61, 220, 151]
const GOOD: RGB = [4, 120, 87]
const BAD: RGB = [185, 28, 28]
const BAR: RGB = [217, 89, 38]
const HEAD_FILL: RGB = [243, 245, 249]

const PAGE_MARGIN = 48

/** Characters the PDF's built-in fonts (WinAnsi encoding) can draw. */
const WIN_ANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'

/** Replaces characters the built-in PDF fonts can't draw, instead of printing garbage. */
export function pdfSafe(text: string): string {
  const replaced = text.replace(/−/g, '-').replace(/→/g, '->') // Unicode minus, arrow
  // Latin-1 (codes 0–255) plus a few extras is what WinAnsi can draw.
  return Array.from(replaced, (ch) => (ch.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRAS.includes(ch) ? ch : '?')).join('')
}

function changeText(change: Change | null, kind: 'percent' | 'points', against: string): { text: string; color: RGB } {
  if (!change || change.amount === null) return { text: `vs ${against}: no comparison`, color: FAINT }
  if (change.direction === 'flat') return { text: `Unchanged vs ${against}`, color: MUTED }
  const sign = change.direction === 'up' ? '+' : '-'
  const value = kind === 'percent' ? `${Math.abs(change.amount).toFixed(1)}%` : `${Math.abs(change.amount).toFixed(1)} pts`
  return { text: `${sign}${value} vs ${against}`, color: change.tone === 'good' ? GOOD : change.tone === 'bad' ? BAD : MUTED }
}

export interface PdfOptions {
  isSample: boolean
  generatedAt: Date
}

export function createReportPdf(report: MonthlyReport, options: PdfOptions): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  const contentWidth = width - PAGE_MARGIN * 2
  const text = (value: string, x: number, y: number, opts?: Parameters<jsPDF['text']>[3]) => doc.text(pdfSafe(value), x, y, opts)
  const setColor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  // ---- Header band ----------------------------------------------------------
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, width, 92, 'F')
  doc.setFillColor(...ACCENT)
  doc.rect(PAGE_MARGIN, 30, 4, 34, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(20)
  doc.setTextColor(255, 255, 255)
  text(report.title, PAGE_MARGIN + 14, 48)
  doc.setFont('helvetica', 'normal').setFontSize(11)
  doc.setTextColor(190, 200, 220)
  text(`${report.subtitle} · ${report.transactionCount} transactions`, PAGE_MARGIN + 14, 66)
  doc.setFontSize(9)
  text('WealthFlow', width - PAGE_MARGIN, 44, { align: 'right' })
  text(`Generated ${options.generatedAt.toLocaleDateString('en-CA', { dateStyle: 'medium' })}`, width - PAGE_MARGIN, 58, { align: 'right' })
  if (options.isSample) {
    doc.setTextColor(250, 178, 25)
    text('Fictional sample data', width - PAGE_MARGIN, 72, { align: 'right' })
  }

  let y = 112

  // ---- Exact dates and what they're compared with ---------------------------
  doc.setFont('helvetica', 'normal').setFontSize(8.5)
  setColor(MUTED)
  text(
    `Exact dates: ${report.dateRange} (${report.days} days, both included). Compared with: ${report.comparisonName.toLowerCase()}${report.previous || report.comparisonName !== 'No comparison' ? ` (${report.previousLabel})` : ''}. All amounts in Canadian dollars (CAD).`,
    PAGE_MARGIN,
    y,
    { maxWidth: contentWidth },
  )
  y += 22

  // ---- Summary tiles --------------------------------------------------------
  const { summary, previous } = report
  const against = report.previousLabel
  const tiles = [
    { label: 'Income', value: formatCents(summary.income), change: changeText(previous && moneyChange(summary.income, previous.income, true), 'percent', against) },
    { label: 'Spending', value: formatCents(summary.expenses), change: changeText(previous && moneyChange(summary.expenses, previous.expenses, false), 'percent', against) },
    { label: 'Net cash flow', value: formatCents(summary.net), change: changeText(previous && moneyChange(summary.net, previous.net, true), 'percent', against) },
    {
      label: 'Savings rate',
      value: formatPercent(summary.savingsRate, 2),
      change: changeText(previous && pointsChange(summary.savingsRate, previous.savingsRate, true), 'points', against),
    },
  ]
  const gap = 10
  const tileWidth = (contentWidth - gap * 3) / 4
  tiles.forEach((tile, i) => {
    const x = PAGE_MARGIN + i * (tileWidth + gap)
    doc.setDrawColor(...RULE).setLineWidth(0.75)
    doc.roundedRect(x, y, tileWidth, 66, 6, 6, 'S')
    doc.setFont('helvetica', 'normal').setFontSize(8.5)
    setColor(MUTED)
    text(tile.label, x + 10, y + 17)
    doc.setFont('helvetica', 'bold').setFontSize(15)
    setColor(INK)
    text(tile.value, x + 10, y + 38)
    doc.setFont('helvetica', 'normal').setFontSize(7.5)
    setColor(tile.change.color)
    text(tile.change.text, x + 10, y + 54)
  })
  y += 66 + 14
  doc.setFont('helvetica', 'normal').setFontSize(8.5)
  setColor(MUTED)
  text(`Average daily spending ${formatCents(report.averageDailySpending)} · average daily income ${formatCents(report.averageDailyIncome)} · ${report.transactionCount} transactions`, PAGE_MARGIN, y)
  y += 24

  const heading = (title: string, subtitle?: string) => {
    if (y > height - 140) {
      doc.addPage()
      y = PAGE_MARGIN + 10
    }
    doc.setFont('helvetica', 'bold').setFontSize(12)
    setColor(INK)
    text(title, PAGE_MARGIN, y)
    if (subtitle) {
      doc.setFont('helvetica', 'normal').setFontSize(8.5)
      setColor(FAINT)
      text(subtitle, width - PAGE_MARGIN, y, { align: 'right' })
    }
    y += 10
  }

  const tableDefaults = {
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 60 },
    theme: 'plain' as const,
    styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, lineColor: RULE, lineWidth: { bottom: 0.5 } },
    headStyles: { fillColor: HEAD_FILL, textColor: MUTED, fontStyle: 'bold' as const, fontSize: 8 },
    footStyles: { textColor: INK, fontStyle: 'bold' as const },
    didParseCell: (data: CellHookData) => {
      data.cell.text = data.cell.text.map(pdfSafe)
    },
  }
  /** A header (or footer) cell aligned right, to sit above a column of numbers. */
  const num = (content: string) => ({ content, styles: { halign: 'right' as const } })

  // ---- Observations -----------------------------------------------------------
  heading('Key observations', 'Calculated from your transactions')
  y += 6
  doc.setFont('helvetica', 'normal').setFontSize(9.5)
  report.observations.forEach((o: Observation) => {
    const lines = doc.splitTextToSize(pdfSafe(o.text), contentWidth - 18) as string[]
    const color = o.tone === 'good' ? GOOD : o.tone === 'bad' ? BAD : FAINT
    doc.setFillColor(...color)
    doc.circle(PAGE_MARGIN + 3, y - 3, 2.5, 'F')
    setColor(INK)
    doc.text(lines, PAGE_MARGIN + 14, y)
    y += lines.length * 12 + 4
  })
  if (report.observations.length === 0) {
    setColor(MUTED)
    text('No transactions in this period.', PAGE_MARGIN, y)
    y += 14
  }
  y += 16

  // ---- Spending by category --------------------------------------------------
  heading('Spending by category', previous ? `Compared with ${against}` : undefined)
  const changesByCategory = new Map(report.categoryChanges.map((c) => [c.category, c]))
  const largest = report.categories[0]?.amount ?? 1
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [['Category', 'Share', num('Amount'), ...(previous ? [num(against), num('Change')] : [])]],
    body: report.categories.map((c) => {
      const change = changesByCategory.get(c.category)
      return [
        c.category,
        `${Math.round(c.share * 100)}%`,
        formatCents(c.amount),
        ...(previous && change
          ? [formatCents(change.previous), change.percent === null ? 'new' : change.difference === 0 ? '0%' : `${change.difference > 0 ? '+' : '-'}${Math.abs(change.percent).toFixed(0)}%`]
          : []),
      ]
    }),
    columnStyles: { 1: { cellWidth: 130 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    didDrawCell: (data) => {
      // Draw a small proportional bar inside the "Share" column.
      if (data.section !== 'body' || data.column.index !== 1) return
      const category = report.categories[data.row.index]
      if (!category) return
      const barX = data.cell.x + 34
      const barWidth = data.cell.width - 44
      const barY = data.cell.y + data.cell.height / 2 - 2.5
      doc.setFillColor(...RULE)
      doc.roundedRect(barX, barY, barWidth, 5, 2.5, 2.5, 'F')
      doc.setFillColor(...BAR)
      doc.roundedRect(barX, barY, Math.max(3, (barWidth * category.amount) / largest), 5, 2.5, 2.5, 'F')
    },
    willDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const change = changesByCategory.get(report.categories[data.row.index]?.category ?? 'Other')
        if (change && change.difference !== 0) doc.setTextColor(...(change.difference > 0 ? BAD : GOOD))
      }
    },
  })
  y = lastY() + 28

  // ---- Biggest expenses -------------------------------------------------------
  heading('Biggest expenses')
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [['Date', 'Description', 'Category', num('Amount')]],
    body: report.biggestExpenses.map((t) => [formatDay(t.date), t.description, t.category, formatCents(-t.amount)]),
    columnStyles: { 0: { cellWidth: 60 }, 3: { halign: 'right' } },
  })
  y = lastY() + 28

  // ---- Recurring payments -----------------------------------------------------
  heading('Recurring payments', report.recurringAvailable ? 'Charged once a month, at a similar amount' : 'Detected per calendar month: choose a month to see them')
  if (report.recurring.length > 0) {
    autoTable(doc, {
      ...tableDefaults,
      startY: y,
      head: [['Payment', 'Category', 'Date', num('Amount')]],
      body: report.recurring.map((r) => [r.name, r.category, formatDay(r.date), formatCents(r.amount)]),
      foot: [['Total', '', '', num(formatCents(report.recurringTotal))]],
      columnStyles: { 2: { cellWidth: 60 }, 3: { halign: 'right' } },
    })
    y = lastY() + 28
  } else {
    y += 8
    doc.setFont('helvetica', 'normal').setFontSize(9)
    setColor(MUTED)
    text('No recurring payments found for this month.', PAGE_MARGIN, y)
    y += 28
  }

  // ---- Balance check (bank accounts with an opening balance) ------------------
  if (report.balanceChecks.length > 0) {
    heading('Balance check', `Opening (start of ${formatDay(report.comparison.current.start)}) + income − expenses ± transfers = expected closing (end of ${formatDay(report.comparison.current.end)}). Only actual balances (yours or the bank's) can verify it.`)
    autoTable(doc, {
      ...tableDefaults,
      startY: y,
      head: [['Account', 'Opening source', num('Opening'), num('Income'), num('Expenses'), num('Transfers'), num('Expected'), num('Actual / bank'), num('Difference')]],
      body: report.balanceChecks.map((r) => [
        r.accountName,
        OPENING_SOURCE_LABEL[r.openingSource!],
        formatCents(r.opening!),
        formatCents(r.income),
        formatCents(r.expenses),
        formatCents(r.transfersIn - r.transfersOut),
        formatCents(r.expectedClosing!),
        r.actualClosing === null ? '-' : `${formatCents(r.actualClosing)}${r.closingSource === 'reported' ? ' (bank)' : ''}`,
        r.difference === null ? '-' : !r.verified ? `${formatCents(r.difference, { signed: true })} (not verified)` : r.difference === 0 ? 'Balanced' : formatCents(r.difference, { signed: true }),
      ]),
      styles: { ...tableDefaults.styles, fontSize: 8 },
      columnStyles: { 1: { cellWidth: 70 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
    })
    y = lastY() + 28
  }

  // ---- Recent months --------------------------------------------------------
  heading(report.kind === 'month' ? 'Recent months' : 'Months in this period', report.kind === 'month' ? undefined : 'Only days inside your period are counted')
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [['Month', num('Income'), num('Spending'), num('Saved'), num('Savings rate')]],
    body: report.history.map((h) => [
      formatMonth(h.month) + (report.comparison.isPartial && h.month === report.month ? ' (to date)' : ''),
      formatCents(h.income),
      formatCents(h.expenses),
      formatCents(h.net),
      formatPercent(h.savingsRate),
    ]),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  })

  // ---- Footer on every page ---------------------------------------------------
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setDrawColor(...RULE).setLineWidth(0.5)
    doc.line(PAGE_MARGIN, height - 40, width - PAGE_MARGIN, height - 40)
    doc.setFont('helvetica', 'normal').setFontSize(7.5)
    setColor(FAINT)
    text('Generated on this device by WealthFlow. Amounts in Canadian dollars (CAD). Transfers between your own accounts are excluded.', PAGE_MARGIN, height - 26)
    text(`Page ${page} of ${pages}`, width - PAGE_MARGIN, height - 26, { align: 'right' })
  }

  return doc
}

/** Builds the PDF and starts the browser's download. */
export function downloadReportPdf(report: MonthlyReport, options: PdfOptions): void {
  createReportPdf(report, options).save(`wealthflow-report-${report.kind === 'month' ? report.month : `${report.comparison.current.start}-to-${report.comparison.current.end}`}.pdf`)
}
