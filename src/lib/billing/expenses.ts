import { splitCentsAmong, splitCentsByWeight } from './money';
import type { Cents, UserId } from './types';

export class ExpenseError extends Error {}

export type SplitRule = 'equal' | 'by_km' | 'custom' | 'none';

export interface ExpenseSplitInput {
  amountCents: Cents;
  rule: SplitRule;
  /** Membri fatturabili del mezzo nel periodo della spesa. */
  memberIds: readonly UserId[];
  /** Km percorsi da ciascuno nel periodo: serve solo alla regola `by_km`. */
  kmByUser?: ReadonlyMap<UserId, number>;
  /** Quote esplicite in centesimi: serve solo alla regola `custom`. */
  customShares?: ReadonlyMap<UserId, Cents>;
}

/**
 * Ripartizione di una spesa fissa o di manutenzione.
 * `none` = la paga chi l'ha anticipata (nessuna quota a carico di altri): è il caso
 * di una spesa della nonna sulla 500.
 */
export function splitExpense(input: ExpenseSplitInput): Map<UserId, Cents> {
  const { amountCents, rule, memberIds, kmByUser, customShares } = input;

  switch (rule) {
    case 'none':
      return new Map();

    case 'equal':
      if (memberIds.length === 0) throw new ExpenseError('Nessun membro fatturabile da addebitare');
      return splitCentsAmong(amountCents, memberIds);

    case 'by_km': {
      if (memberIds.length === 0) throw new ExpenseError('Nessun membro fatturabile da addebitare');
      if (!kmByUser) throw new ExpenseError('Regola by_km senza i km del periodo');
      const weights = new Map(memberIds.map((id) => [id, kmByUser.get(id) ?? 0]));
      // Nessuno ha percorso km nel periodo: la spesa si divide comunque, in parti uguali.
      return splitCentsByWeight(amountCents, weights);
    }

    case 'custom': {
      if (!customShares || customShares.size === 0) {
        throw new ExpenseError('Regola custom senza quote esplicite');
      }
      const total = [...customShares.values()].reduce((a, b) => a + b, 0);
      if (total !== amountCents) {
        throw new ExpenseError(
          `Le quote personalizzate sommano ${total}, la spesa è ${amountCents}`,
        );
      }
      return new Map(customShares);
    }
  }
}
