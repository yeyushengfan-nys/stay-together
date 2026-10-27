// Display-only decisions. Unknown facts never become confirmed facts here.
(function (root) {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const positive = value => finite(value) && value > 0;
  const labels = {
    smart: '智能马桶', laundry: '免费自助洗衣', mold: '目标房型异味反馈',
    metro: '地铁步行时间', budget: '最终含税价', newness: '开业／适用客房翻新年份'
  };
  const affirmative = {
    smart: '有智能马桶资料', laundry: '有免费自助洗衣资料',
    quiet: '隔音有住客正向反馈', breakfast: '已显示包含早餐',
    freeCancel: '已显示免费取消窗口', twinBeds: '有双床房资料', nonSmoking: '有无烟客房资料'
  };
  const negative = {
    smart: '无智能马桶', laundry: '无免费自助洗衣', quiet: '有隔音不佳反馈',
    breakfast: '不含所需早餐', freeCancel: '不支持所需免费取消',
    twinBeds: '不是所需双床房', nonSmoking: '不符合无烟客房要求'
  };
  function bucket() {
    const items = [], keys = new Set();
    return {items, add(key, label) {if (!keys.has(key)) {keys.add(key); items.push({key, label});}}};
  }
  function build(hotels, people, trip = {}) {
    const engine = root.HotelEngine, criteria = root.HotelCriteria;
    if (!engine?.factsFor || !engine?.evaluate || !criteria) throw new Error('Load HotelEngine and HotelCriteria before HotelDecisionSummary.');
    const year = /^\d{4}/.test(trip.checkin || '') ? Number(trip.checkin.slice(0, 4)) : new Date().getFullYear();
    const members = Array.isArray(people) ? people : [];
    const hardBudgets = members.filter(p => p.budgetHard && positive(p.budget)).map(p => p.budget);
    const softBudgets = members.filter(p => positive(p.budget)).map(p => p.budget);
    const ceiling = (hardBudgets.length ? hardBudgets : softBudgets).length ? Math.min(...(hardBudgets.length ? hardBudgets : softBudgets)) : null;
    return (Array.isArray(hotels) ? hotels : []).map(hotel => {
      const {facts, conflicts: sourceConflicts, policy} = engine.factsFor(hotel, trip);
      const known = bucket(), missing = bucket(), conflicts = bucket(), optionalUnknown = bucket();
      const required = new Set(), preferred = new Set();
      for (const p of members) {
        for (const c of criteria.conditions(p)) (c.mode === 'must' ? required : preferred).add(c.id);
        if (p.requireSmart) required.add('smart');
        if (p.requireLaundry) required.add('laundry');
        if (p.smartPreference === 'prefer') preferred.add('smart');
        if (p.laundryPreference === 'prefer') preferred.add('laundry');
      }
      const labelFor = key => labels[key] || criteria.catalog.find(c => c.id === key)?.label || key;
      for (const key of new Set([...required, ...preferred])) {
        const value = facts[key], label = labelFor(key);
        if (value == null) {
          (required.has(key) ? missing : optionalUnknown).add(key, sourceConflicts.includes(key) ? label + '资料有冲突' : label);
        } else if (value === true) known.add(key, affirmative[key] || '有' + label + '资料');
        else if (required.has(key)) conflicts.add(key, negative[key] || '不符合' + label + '要求');
        else known.add(key, negative[key] || '未提供' + label);
      }
      if (members.some(p => p.avoidMold)) {
        if (facts.mold == null) missing.add('mold', sourceConflicts.includes('mold') ? '目标房型异味反馈有冲突' : labels.mold);
        else if (facts.mold === true) conflicts.add('mold', '有潮味／霉味反馈');
        else known.add('mold', '已查样本反馈未闻到异味（非保证）');
      }
      const transitMembers = members.filter(p => p.transitHard);
      if (transitMembers.length) {
        if (!finite(hotel.metro)) missing.add('metro', labels.metro);
        else if (transitMembers.some(p => hotel.metro > p.maxMetro)) conflicts.add('metro', '超过同行人的地铁步行上限');
        else known.add('metro', '地铁步行约' + hotel.metro + '分钟');
      } else if (finite(hotel.metro)) known.add('metro', '地铁步行约' + hotel.metro + '分钟');
      const newnessMembers = members.filter(p => p.newnessHard);
      const failedNewness = [];
      for (const p of newnessMembers) {
        const n = criteria.freshness(facts, p.newnessPolicy, year);
        if (n.age == null) missing.add('newness', labels.newness);
        else if (n.age > criteria.policy(p.newnessPolicy).newWithin) failedNewness.push(p.name || '同行人');
      }
      if (failedNewness.length) conflicts.add('newness', '不符合' + [...new Set(failedNewness)].join('、') + '的新旧要求');
      else if (newnessMembers.length && !missing.items.some(x => x.key === 'newness')) known.add('newness', '新旧符合每位同行人的标准');
      if (Number.isInteger(facts.opened)) known.add('opened', facts.opened + '年开业');
      if (Number.isInteger(facts.renovated)) known.add('renovated', facts.renovated + '年装修' + (facts.renovationScope === 'guestrooms' ? '（已核对客房范围）' : '（范围未明）'));
      if (!newnessMembers.length && members.some(p => Number(p.weights?.newness) > 0) && !Number.isInteger(facts.opened) && !Number.isInteger(facts.renovated)) optionalUnknown.add('newness', labels.newness);
      const basis = positive(hotel.price) ? 'verified' : positive(hotel.referencePrice) ? 'reference' : 'unknown';
      const amount = basis === 'verified' ? hotel.price : basis === 'reference' ? hotel.referencePrice : null;
      const budget = {amount, ceiling, basis, within: amount == null || ceiling == null ? null : amount <= ceiling};
      if (hardBudgets.length) {
        if (basis !== 'verified') missing.add('budget', basis === 'reference' ? '最终含税价（已有参考价仅用于初筛）' : '最终含税价');
        else if (!budget.within) conflicts.add('budget', '已核实房价超出必要预算');
      } else if (basis === 'unknown') optionalUnknown.add('budget', '房型价格');
      const evaluation = engine.evaluate(hotel, members, year, trip);
      const formalEligible = members.length > 0 && !evaluation.blocks.length && !evaluation.pending.length && !conflicts.items.length && !missing.items.length;
      const code = conflicts.items.length ? 'excluded' : basis === 'reference' && hardBudgets.length && budget.within === false ? 'over_reference_budget' : formalEligible ? 'ready' : 'needs_evidence';
      const label = {ready:'满足已确认必要条件', needs_evidence:'还需核实' + missing.items.length + '项必要信息', excluded:'不符合必要条件', over_reference_budget:'当前参考价超预算'}[code];
      return {hotel, facts, policy, code, label, known:known.items, missing:missing.items, conflicts:conflicts.items, optionalUnknown:optionalUnknown.items, budget, formalEligible};
    });
  }
  const api = {build};
  if (typeof module !== 'undefined') module.exports = api;
  root.HotelDecisionSummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
