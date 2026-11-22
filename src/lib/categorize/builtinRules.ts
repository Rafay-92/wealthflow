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
    keywords: ['PAYROLL', 'SALARY', 'DIRECT DEP', 'DIRECT DEPOSIT', 'PAYCHECK', 'INVOICE', 'INTEREST', 'INTEREST PAYMENT', 'DIVIDEND', 'IRS TREAS', 'TAX REFUND', 'BONUS', 'PAIE', 'DEPOT DIRECT', 'CANADA GST', 'GST CREDIT', 'GST HST', 'CANADA CHILD BENEFIT', 'CCB', 'CANADA FED', 'CANADA PRO', 'CPP', 'OAS', 'EI BENEFITS'],
  },
  {
    category: 'Groceries',
    keywords: ['WHOLE FOODS', "TRADER JOE'S", 'TRADER JOE', 'SAFEWAY', 'KROGER', 'ALDI', 'PUBLIX', 'WEGMANS', 'COSTCO', 'SPROUTS', 'INSTACART', 'GROCERY', 'GROCERIES', 'SUPERMARKET', 'FARMERS MARKET', 'FOOD LION', 'GIANT EAGLE', 'STOP & SHOP', 'LOBLAWS', 'NO FRILLS', 'SOBEYS', 'FRESHCO', 'FOODLAND', 'SUPERSTORE', 'REAL CANADIAN SUPERSTORE', 'ZEHRS', 'FORTINOS', 'IGA', 'MAXI', 'PROVIGO', 'SAVE ON FOODS', 'FARM BOY', 'VALU MART', 'EPICERIE'],
  },
  {
    category: 'Restaurants',
    keywords: ['STARBUCKS', 'CHIPOTLE', 'SWEETGREEN', "MCDONALD'S", 'MCDONALD', 'DOORDASH', 'UBER EATS', 'UBEREATS', 'GRUBHUB', 'POSTMATES', 'DUNKIN', 'PANERA', "DOMINO'S", 'DOMINOS', 'SUBWAY', 'TACO BELL', 'CHICK-FIL-A', 'PIZZA', 'CAFE', 'COFFEE', 'RESTAURANT', 'KITCHEN', 'BURGER', 'SUSHI', 'TACO', 'GRILL', 'BAKERY', 'DINER', 'BISTRO', 'TIM HORTONS', 'TIM HORTON', 'SECOND CUP', 'SWISS CHALET', "HARVEY'S", "MARY BROWN'S", 'A&W', 'SKIPTHEDISHES', 'SKIP THE DISHES', 'BOOSTER JUICE', 'PIZZA PIZZA', 'RESTO'],
  },
  {
    category: 'Transportation',
    keywords: ['UBER', 'LYFT', 'SHELL', 'CHEVRON', 'EXXON', 'EXXONMOBIL', 'MOBIL', 'ARCO', 'VALERO', 'FUEL', 'PARKING', 'TRANSIT', 'CLIPPER', 'AMTRAK', 'TOLL', 'E-ZPASS', 'GREYHOUND', 'DELTA AIR', 'UNITED AIRLINES', 'SOUTHWEST AIRLINES', 'AMERICAN AIRLINES', 'JETBLUE', 'PRESTO', 'PETRO-CANADA', 'PETRO CANADA', 'ESSO', 'HUSKY', 'ULTRAMAR', 'IRVING OIL', 'TTC', 'STM', 'TRANSLINK', 'OC TRANSPO', 'GO TRANSIT', 'VIA RAIL', 'AIR CANADA', 'WESTJET', 'PORTER AIRLINES', 'GREEN P', 'IMPARK', 'COMMUNAUTO'],
  },
  {
    category: 'Shopping',
    keywords: ['AMAZON', 'AMZN', 'ALIBABA', 'ALIEXPRESS', 'TEMU', 'SHEIN', 'TARGET', 'WALMART', 'BEST BUY', 'EBAY', 'ETSY', 'IKEA', 'HOME DEPOT', "LOWE'S", 'LOWES', "MACY'S", 'NORDSTROM', 'APPLE STORE', 'NIKE', 'ZARA', 'H&M', 'TJ MAXX', 'MARSHALLS', 'BOOKSHOP', 'BOOKSTORE', 'SEPHORA', 'ULTA', 'CANADIAN TIRE', 'WINNERS', 'HOMESENSE', 'SPORT CHEK', 'DOLLARAMA', "HUDSON'S BAY", 'THE BAY', 'SIMONS', 'INDIGO', 'MEC', 'GIANT TIGER', 'STAPLES', 'LONDON DRUGS', 'MARK S'],
  },
  {
    category: 'Entertainment',
    keywords: ['AMC', 'AMC THEATRES', 'REGAL', 'CINEMA', 'THEATRE', 'THEATER', 'TICKETMASTER', 'STUBHUB', 'EVENTBRITE', 'STEAMPOWERED', 'STEAM GAMES', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'BOWLING', 'MUSEUM', 'CONCERT', 'CINEPLEX', 'LANDMARK CINEMAS', 'CINEMAS'],
  },
  {
    category: 'Subscriptions',
    keywords: ['NETFLIX', 'SPOTIFY', 'HULU', 'DISNEY PLUS', 'DISNEYPLUS', 'HBO', 'YOUTUBE PREMIUM', 'APPLE.COM/BILL', 'ICLOUD', 'AMAZON PRIME', 'PRIME VIDEO', 'AUDIBLE', 'PARAMOUNT', 'PEACOCK', 'PLANET FITNESS', 'GYM', 'PELOTON', 'ADOBE', 'MICROSOFT', 'DROPBOX', 'PATREON', 'NYTIMES', 'GOOGLE STORAGE', 'GOOGLE ONE', 'CRAVE', 'CBC GEM', 'GOODLIFE', 'ANYTIME FITNESS'],
  },
  {
    category: 'Housing',
    keywords: ['RENT', 'APARTMENTS', 'APARTMENT', 'MORTGAGE', 'HOA', 'PROPERTY MANAGEMENT', 'LANDLORD', 'RENTERS INSURANCE', 'LOYER', 'CONDO FEES', 'CONDO CORP', 'PROPERTY TAX', 'TENANT INSURANCE'],
  },
  {
    category: 'Utilities',
    keywords: ['ELECTRIC', 'POWER', 'POWER & LIGHT', 'WATER', 'SEWER', 'TRASH', 'WASTE MANAGEMENT', 'INTERNET', 'COMCAST', 'XFINITY', 'VERIZON', 'AT&T', 'T-MOBILE', 'SPECTRUM', 'PG&E', 'CON EDISON', 'NATIONAL GRID', 'DUKE ENERGY', 'HYDRO', 'HYDRO ONE', 'HYDRO QUEBEC', 'ENBRIDGE', 'FORTISBC', 'EPCOR', 'ATCO', 'ROGERS', 'BELL CANADA', 'BELL MOBILITY', 'TELUS', 'FIDO', 'KOODO', 'VIRGIN PLUS', 'FREEDOM MOBILE', 'PUBLIC MOBILE', 'SHAW', 'VIDEOTRON', 'COGECO'],
  },
  {
    category: 'Education',
    keywords: ['TUITION', 'UDEMY', 'COURSERA', 'SKILLSHARE', 'MASTERCLASS', 'DUOLINGO', 'SCHOOL', 'COLLEGE', 'UNIVERSITY', 'STUDENT LOAN', 'OSAP', 'NSLSC', 'UNIVERSITE'],
  },
  {
    category: 'Healthcare',
    keywords: ['CVS', 'WALGREENS', 'RITE AID', 'PHARMACY', 'MEDICAL', 'DENTAL', 'DENTIST', 'DOCTOR', 'HOSPITAL', 'CLINIC', 'COPAY', 'URGENT CARE', 'LABCORP', 'QUEST DIAGNOSTICS', 'OPTOMETRY', 'VISION', 'SHOPPERS DRUG MART', 'SHOPPERS DRUG', 'REXALL', 'JEAN COUTU', 'PHARMAPRIX', 'UNIPRIX', 'PHYSIO', 'PHYSIOTHERAPY', 'MASSAGE THERAPY', 'OPTOMETRIST'],
  },
  {
    category: 'Other',
    keywords: ['ATM WITHDRAWAL', 'ATM', 'CASH WITHDRAWAL', 'SERVICE FEE', 'OVERDRAFT', 'INTEREST CHARGE', 'MONTHLY FEE', 'SERVICE CHARGE', 'NSF FEE', 'FRAIS'],
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
  // Paying a credit card from chequing: the purchases are already counted on the
  // card itself, so counting the payment too would double-count them.
  'VISA PAYMENT',
  'PAYMENT VISA',
  'MASTERCARD PAYMENT',
  'PAYMENT MASTERCARD',
  'AMEX PAYMENT',
  'AMERICAN EXPRESS PAYMENT',
  'CREDIT CARD PMT',
  'CC PAYMENT',
  'PAYMENT TO CREDIT CARD',
  // Canadian banks' own wording (TD, RBC, CIBC) and French
  'TFR TO',
  'TFR FR',
  'TFR FROM',
  'WWW TRF',
  'BANKING TRANSFER',
  'INTERNET TRANSFER',
  'MB TRANSFER',
  'VIREMENT',
  'PAIEMENT MERCI',
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
export const TRANSFERISH_WORDS = ['TRANSFER', 'XFER', 'PAYMENT', 'PMT', 'AUTOPAY', 'EPAYMENT', 'DEPOSIT', 'WITHDRAWAL', 'TFR', 'TRF', 'VIREMENT', 'PAIEMENT']

/**
 * Person-to-person payments, including Interac e-Transfers. "SEND E-TFR TO ALEX" is money leaving you,
 * i.e. real spending, not a transfer between your own accounts. These are
 * never treated as transfers automatically.
 */
/**
 * Interac e-Transfers and payment apps used to pay PEOPLE. These get their
 * own "E-Transfers" category, checked before merchant keywords, because
 * descriptions like "INTERNET BANKING E-TRANSFER" would otherwise match
 * "INTERNET" (a Utilities keyword). PayPal isn't here: it's mostly shopping.
 */
export const E_TRANSFER_PHRASES = ['E TRANSFER', 'ETRANSFER', 'E TFR', 'EMT', 'VIREMENT INTERAC', 'INTERAC TRANSFER', 'ZELLE', 'VENMO', 'CASH APP', 'CASHAPP']

export const PEER_TO_PEER = ['ZELLE', 'VENMO', 'CASH APP', 'CASHAPP', 'PAYPAL', 'E TRANSFER', 'ETRANSFER', 'E TFR', 'EMT', 'VIREMENT INTERAC']

/**
 * Wording for money coming back: refunds, returns and reversals. A refund
 * reduces spending; it is never income.
 */
export const REFUND_PHRASES = ['REFUND', 'REFUNDED', 'REVERSAL', 'REVERSED', 'REVERSE', 'RETURN', 'RETURNED', 'CREDIT VOUCHER', 'CHARGEBACK', 'MERCHANDISE CREDIT', 'MERCH CREDIT', 'REMBOURSEMENT', 'RETOUR', 'ANNULATION']
