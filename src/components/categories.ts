import {
  ArrowLeftRight,
  Car,
  CircleDashed,
  Clapperboard,
  GraduationCap,
  HeartPulse,
  House,
  Repeat,
  Send,
  ShoppingBag,
  ShoppingCart,
  UtensilsCrossed,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { Category } from '../types/transaction'

/**
 * Each category gets an icon. Not a colour: with 13 categories, colours
 * become impossible to tell apart, so identity comes from the icon + name.
 * `Record<Category, …>` forces an entry for every category — add a new
 * category and TypeScript will point here until you give it an icon.
 */
export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  Shopping: ShoppingBag,
  Restaurants: UtensilsCrossed,
  Groceries: ShoppingCart,
  Transportation: Car,
  Entertainment: Clapperboard,
  Subscriptions: Repeat,
  Housing: House,
  Utilities: Zap,
  Education: GraduationCap,
  Healthcare: HeartPulse,
  'E-Transfers': Send,
  Transfers: ArrowLeftRight,
  Income: Wallet,
  Other: CircleDashed,
}
