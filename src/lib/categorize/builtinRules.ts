import type { Category } from '../../types/transaction'

/**
 * Built-in merchant keywords. Written as plain text and normalised at
 * startup, so "TRADER JOE'S" and "APPLE.COM/BILL" work as written.
 *
 * When several keywords match, the LONGEST wins, because it's the most
 * specific: "UBER EATS" (Restaurants) beats "UBER" (Transportation), and
 * "AMAZON PRIME" (Subscriptions) beats "AMAZON" (Shopping).
 *
 * `direction` limits a keyword to money in or money out. "INTEREST" means
 * income only when money arrives; a card's "INTEREST CHARGE" is a cost.
 */
export interface KeywordGroup {
  category: Category
  direction?: 'in' | 'out'
  keywords: string[]
}

export const BUILTIN_KEYWORDS: KeywordGroup[] = [
  {
    category: 'Income',
    direction: 'in',
    keywords: ['PAYROLL', 'SALARY', 'DIRECT DEP', 'DIRECT DEPOSIT', 'PAYCHECK', 'INVOICE', 'INTEREST', 'INTEREST PAYMENT', 'DIVIDEND', 'IRS TREAS', 'TAX REFUND', 'BONUS'],
  },
  {
    category: 'Groceries',
    keywords: ['WHOLE FOODS', "TRADER JOE'S", 'TRADER JOE', 'SAFEWAY', 'KROGER', 'ALDI', 'PUBLIX', 'WEGMANS', 'COSTCO', 'SPROUTS', 'INSTACART', 'GROCERY', 'GROCERIES', 'SUPERMARKET', 'FARMERS MARKET', 'FOOD LION', 'GIANT EAGLE', 'STOP & SHOP'],
  },
  {
    category: 'Restaurants',
    keywords: ['STARBUCKS', 'CHIPOTLE', 'SWEETGREEN', "MCDONALD'S", 'MCDONALD', 'DOORDASH', 'UBER EATS', 'UBEREATS', 'GRUBHUB', 'POSTMATES', 'DUNKIN', 'PANERA', "DOMINO'S", 'DOMINOS', 'SUBWAY', 'TACO BELL', 'CHICK-FIL-A', 'PIZZA', 'CAFE', 'COFFEE', 'RESTAURANT', 'KITCHEN', 'BURGER', 'SUSHI', 'TACO', 'GRILL', 'BAKERY', 'DINER', 'BISTRO'],
  },
  {
    category: 'Transportation',
    keywords: ['UBER', 'LYFT', 'SHELL', 'CHEVRON', 'EXXON', 'EXXONMOBIL', 'MOBIL', 'ARCO', 'VALERO', 'FUEL', 'PARKING', 'TRANSIT', 'CLIPPER', 'AMTRAK', 'TOLL', 'E-ZPASS', 'GREYHOUND', 'DELTA AIR', 'UNITED AIRLINES', 'SOUTHWEST AIRLINES', 'AMERICAN AIRLINES', 'JETBLUE'],
  },
  {
    category: 'Shopping',
    keywords: ['AMAZON', 'AMZN', 'TARGET', 'WALMART', 'BEST BUY', 'EBAY', 'ETSY', 'IKEA', 'HOME DEPOT', "LOWE'S", 'LOWES', "MACY'S", 'NORDSTROM', 'APPLE STORE', 'NIKE', 'ZARA', 'H&M', 'TJ MAXX', 'MARSHALLS', 'BOOKSHOP', 'BOOKSTORE', 'SEPHORA', 'ULTA'],
  },
  {
    category: 'Entertainment',
    keywords: ['AMC', 'AMC THEATRES', 'REGAL', 'CINEMA', 'THEATRE', 'THEATER', 'TICKETMASTER', 'STUBHUB', 'EVENTBRITE', 'STEAMPOWERED', 'STEAM GAMES', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'BOWLING', 'MUSEUM', 'CONCERT'],
  },
  {
    category: 'Subscriptions',
    keywords: ['NETFLIX', 'SPOTIFY', 'HULU', 'DISNEY PLUS', 'DISNEYPLUS', 'HBO', 'YOUTUBE PREMIUM', 'APPLE.COM/BILL', 'ICLOUD', 'AMAZON PRIME', 'PRIME VIDEO', 'AUDIBLE', 'PARAMOUNT', 'PEACOCK', 'PLANET FITNESS', 'GYM', 'PELOTON', 'ADOBE', 'MICROSOFT 365', 'DROPBOX', 'PATREON', 'NYTIMES', 'GOOGLE STORAGE', 'GOOGLE ONE'],
  },
  {
    category: 'Housing',
    keywords: ['RENT', 'APARTMENTS', 'APARTMENT', 'MORTGAGE', 'HOA', 'PROPERTY MANAGEMENT', 'LANDLORD', 'RENTERS INSURANCE'],
  },
  {
    category: 'Utilities',
    keywords: ['ELECTRIC', 'POWER', 'POWER & LIGHT', 'WATER', 'SEWER', 'TRASH', 'WASTE MANAGEMENT', 'INTERNET', 'COMCAST', 'XFINITY', 'VERIZON', 'AT&T', 'T-MOBILE', 'SPECTRUM', 'PG&E', 'CON EDISON', 'NATIONAL GRID', 'DUKE ENERGY'],
  },
  {
    category: 'Education',
    keywords: ['TUITION', 'UDEMY', 'COURSERA', 'SKILLSHARE', 'MASTERCLASS', 'DUOLINGO', 'SCHOOL', 'COLLEGE', 'UNIVERSITY', 'STUDENT LOAN'],
  },
  {
    category: 'Healthcare',
    keywords: ['CVS', 'WALGREENS', 'RITE AID', 'PHARMACY', 'MEDICAL', 'DENTAL', 'DENTIST', 'DOCTOR', 'HOSPITAL', 'CLINIC', 'COPAY', 'URGENT CARE', 'LABCORP', 'QUEST DIAGNOSTICS', 'OPTOMETRY', 'VISION'],
  },
  {
    category: 'Other',
    keywords: ['ATM WITHDRAWAL', 'ATM', 'CASH WITHDRAWAL', 'SERVICE FEE', 'OVERDRAFT', 'INTEREST CHARGE'],
  },
]

/**
 * Wording that clearly means money moving between your OWN accounts.
 * Wins over merchant keywords.
 */
export const STRONG_TRANSFER_PHRASES = [
  'TRANSFER TO',
  'TRANSFER FROM',
  'ONLINE TRANSFER',
  'INTERNAL TRANSFER',
  'SAVINGS TRANSFER',
  'XFER',
  'PAYMENT THANK YOU',
  'PAYMENT RECEIVED',
  'CREDIT CARD PAYMENT',
]

/**
 * Wording that USUALLY means a transfer, but also appears on bills
 * ("COMCAST AUTOPAY"). Only used when no merchant keyword matched.
 */
export const WEAK_TRANSFER_PHRASES = ['AUTOPAY', 'AUTO PAY', 'CARD PAYMENT', 'EPAYMENT', 'CREDIT CRD']

/**
 * Words that make a transaction a candidate when looking for matching
 * transfer pairs across accounts.
 */
export const TRANSFERISH_WORDS = ['TRANSFER', 'XFER', 'PAYMENT', 'PMT', 'AUTOPAY', 'EPAYMENT', 'DEPOSIT', 'WITHDRAWAL']

/**
 * Person-to-person payment apps. "ZELLE TRANSFER TO ALEX" is money leaving you,
 * i.e. real spending, not a transfer between your own accounts. These are
 * never treated as transfers automatically.
 */
export const PEER_TO_PEER = ['ZELLE', 'VENMO', 'CASH APP', 'CASHAPP', 'PAYPAL']
