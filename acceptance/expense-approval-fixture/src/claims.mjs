export const APPROVAL_LIMIT_CENTS = 100000;

export class ClaimService {
  constructor(store) { this.store = store; }

  submit(input, actor) {
    if (!actor?.id || !actor?.tenantId || actor.tenantId !== input.tenantId) throw new Error('forbidden');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('invalid amount');
    if (input.currency !== 'CNY') throw new Error('unsupported currency');
    if (this.store.read(input.id)) throw new Error('duplicate id');
    return this.store.write({id: input.id, tenantId: input.tenantId, employeeId: actor.id,
      amountCents: input.amountCents, currency: 'CNY', status: 'submitted', ledger: []});
  }

  get(id, actor) {
    const claim = this.store.read(id);
    if (!claim || !actor?.id || actor.tenantId !== claim.tenantId) throw new Error('forbidden');
    return claim;
  }

  approve(id, actor) {
    const claim = this.get(id, actor);
    if (actor.id === claim.employeeId) throw new Error('self approval');
    if (actor.role !== 'approver') throw new Error('approver required');
    if (claim.status !== 'submitted') throw new Error('invalid transition');
    if (claim.amountCents > APPROVAL_LIMIT_CENTS) throw new Error('above limit');
    claim.status = 'approved';
    claim.approverId = actor.id;
    return this.store.write(claim);
  }

  reimburse(id, actor) {
    const claim = this.get(id, actor);
    if (actor.role !== 'finance') throw new Error('finance required');
    if (claim.status !== 'approved') throw new Error('invalid transition');
    claim.ledger = [
      {side: 'debit', amountCents: claim.amountCents},
      {side: 'credit', amountCents: claim.amountCents}
    ];
    claim.status = 'reimbursed';
    return this.store.write(claim);
  }
}
