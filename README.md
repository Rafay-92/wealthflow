# WealthFlow

A personal finance analytics app. You import CSV bank statements and it shows you where your money goes.

**Privacy:** everything runs locally in your browser. Nothing is uploaded and there is no backend.
Only use fictional sample data until the app has been through a security review.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server at http://localhost:5173 |
| `npm test` | Run the unit tests once |
| `npm run test:watch` | Re-run the tests every time you save |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Check the code for common mistakes |

## Architecture

- `src/lib/`: pure financial logic (no React), fully unit-tested
- `src/types/`: shared TypeScript types
- `src/components/`: reusable UI pieces
- `src/pages/`: one component per route

Money is always stored as integer cents (see `src/lib/money.ts`).
