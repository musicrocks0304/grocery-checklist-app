import { getNextStep } from './Home';

describe('getNextStep', () => {
  test('priority 1: list built, some items shopped → Finish shopping', () => {
    const result = getNextStep({ mealsPlanned: 2, listItems: 12, shoppedCount: 9, dealsChecked: true, cartBuilt: true });
    expect(result).toEqual({
      label: 'Finish shopping',
      screen: 'shop',
      sublabel: '3 items left on your list',
    });
  });

  test('priority 1: sublabel pluralizes to singular "1 item left"', () => {
    const result = getNextStep({ mealsPlanned: 2, listItems: 12, shoppedCount: 11, dealsChecked: true, cartBuilt: true });
    expect(result.sublabel).toBe('1 item left on your list');
  });

  test('priority 2: all items shopped, meals planned → Time to cook', () => {
    const result = getNextStep({ mealsPlanned: 3, listItems: 10, shoppedCount: 10, dealsChecked: true, cartBuilt: true });
    expect(result).toEqual({
      label: 'Time to cook',
      screen: 'cook',
      sublabel: "Everything's home — pick tonight's recipe",
    });
  });

  test('priority 2: all items shopped (shoppedCount > listItems), no meals planned → Shopping done', () => {
    const result = getNextStep({ mealsPlanned: 0, listItems: 10, shoppedCount: 10, dealsChecked: true, cartBuilt: true });
    expect(result).toEqual({
      label: 'Shopping done',
      screen: 'plan',
      sublabel: "Start next week's list whenever you're ready",
    });
  });

  test('priority 3: no list items, no meals planned → Build your list (starter sublabel)', () => {
    const result = getNextStep({ mealsPlanned: 0, listItems: 0, shoppedCount: 0, dealsChecked: false, cartBuilt: false });
    expect(result).toEqual({
      label: 'Build your list',
      screen: 'plan',
      sublabel: 'Pick staples or plan meals to get started',
    });
  });

  test('priority 3: no list items, meals already planned → Build your list (add items sublabel)', () => {
    const result = getNextStep({ mealsPlanned: 4, listItems: 0, shoppedCount: 0, dealsChecked: false, cartBuilt: false });
    expect(result).toEqual({
      label: 'Build your list',
      screen: 'plan',
      sublabel: "Add this week's items to your list",
    });
  });

  test('priority 4: list built, no shopping yet, deals not checked → Check Deals', () => {
    const result = getNextStep({ mealsPlanned: 2, listItems: 8, shoppedCount: 0, dealsChecked: false, cartBuilt: false });
    expect(result).toEqual({
      label: 'Check Deals',
      screen: 'deals',
      sublabel: 'See coupons matching your list',
    });
  });

  test('priority 5: deals checked, cart not built → Build HEB Cart', () => {
    const result = getNextStep({ mealsPlanned: 2, listItems: 8, shoppedCount: 0, dealsChecked: true, cartBuilt: false });
    expect(result).toEqual({
      label: 'Build HEB Cart',
      screen: 'cart',
      sublabel: 'Match items and fill your cart',
    });
  });

  test('priority 6: everything ready → Ready to Shop!', () => {
    const result = getNextStep({ mealsPlanned: 2, listItems: 8, shoppedCount: 0, dealsChecked: true, cartBuilt: true });
    expect(result).toEqual({
      label: 'Ready to Shop!',
      screen: 'shop',
      sublabel: 'Your list is ready — head to the store',
    });
  });

  test('regression for FB#46: list built and 9/12 shopped must not say Plan Your Meals even when mealsPlanned is 0', () => {
    const result = getNextStep({ mealsPlanned: 0, listItems: 12, shoppedCount: 9, dealsChecked: false, cartBuilt: false });
    expect(result.label).toBe('Finish shopping');
  });
});
