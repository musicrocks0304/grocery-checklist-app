import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReviewScreen from './ReviewScreen';

const items = [
  { ItemID: 1, ItemName: 'Milk', Category: 'Dairy & eggs', DataSource: 'Staples' },
  { ItemID: 2, ItemName: 'Bread', Category: 'Bakery & bread', DataSource: 'Staples' },
  { ItemID: 9, ItemName: 'Candles', Category: 'Household & other', DataSource: 'OneOff' },
  { ItemID: 100, ItemName: 'Chicken thighs', Category: 'Meat & seafood', DataSource: 'MealIngredients' },
  { ItemID: 3, ItemName: 'Gatorade', Category: 'Beverages', DataSource: 'Staples' }, // unselected
];

const meals = [
  { mealName: 'Chicken tacos', ingredientNames: ['Chicken thighs'] },
];

describe('ReviewScreen', () => {
  test('shows header with selected count and week range', () => {
    render(
      <ReviewScreen
        items={items}
        selected={new Set([1, 2, 9, 100])}
        meals={meals}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText(/review your list/i)).toBeInTheDocument();
    expect(screen.getByText(/4 items/i)).toBeInTheDocument();
  });

  test('renders One-offs / Meals / Staples sections with selected items only', () => {
    render(
      <ReviewScreen
        items={items}
        selected={new Set([1, 2, 9, 100])}
        meals={meals}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText('Candles')).toBeInTheDocument();       // OneOff
    expect(screen.getByText('Chicken thighs')).toBeInTheDocument(); // Meal ingredient
    expect(screen.getByText('Chicken tacos')).toBeInTheDocument();  // Meal name
    expect(screen.getByText('Milk')).toBeInTheDocument();           // Staple
    expect(screen.getByText('Bread')).toBeInTheDocument();          // Staple
    expect(screen.queryByText('Gatorade')).not.toBeInTheDocument(); // Unselected, hidden
  });

  test('Start Shopping calls onStartShopping, Back calls onBack', () => {
    const onBack = jest.fn();
    const onStartShopping = jest.fn();
    render(
      <ReviewScreen
        items={items}
        selected={new Set([1])}
        meals={[]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={onBack}
        onStartShopping={onStartShopping}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /start shopping/i }));
    expect(onStartShopping).toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: /back to edit/i })[0]);
    expect(onBack).toHaveBeenCalled();
  });

  test('remove button calls onRemoveOneOff for OneOffs, onToggle for others', () => {
    const onToggle = jest.fn();
    const onRemoveOneOff = jest.fn();
    render(
      <ReviewScreen
        items={items}
        selected={new Set([1, 9])}
        meals={[]}
        onToggle={onToggle}
        onRemoveOneOff={onRemoveOneOff}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /remove candles/i }));
    expect(onRemoveOneOff).toHaveBeenCalledWith(9);
    fireEvent.click(screen.getByRole('button', { name: /remove milk/i }));
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  test('empty state when nothing selected', () => {
    render(
      <ReviewScreen
        items={items}
        selected={new Set()}
        meals={[]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText(/nothing selected yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start shopping/i })).toBeDisabled();
  });

  // ── Attribution parity with StaplesScreen (follow-up to TB-4) ──────────
  // The list screen derives meal attribution from RecipeNames (ItemID - 1000 ->
  // ingredient_id, computed in `Pull Grocery Staples`). ReviewScreen used to
  // re-derive it from a lowercased name lookup, so the same item could be filed
  // under a different meal on the two screens, and optional items carried no
  // marker here at all.

  test('RecipeNames wins over the legacy name lookup for grouping', () => {
    render(
      <ReviewScreen
        items={[
          {
            ItemID: 1101,
            ItemName: 'Chicken thighs',
            Category: 'Meat & seafood',
            DataSource: 'MealIngredients',
            RecipeNames: 'Sheet pan chicken',
          },
        ]}
        selected={new Set([1101])}
        // The name lookup would file this under "Chicken tacos" — the derived
        // attribution must win.
        meals={[{ mealName: 'Chicken tacos', ingredientNames: ['Chicken thighs'] }]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText('Sheet pan chicken')).toBeInTheDocument();
    expect(screen.queryByText('Chicken tacos')).not.toBeInTheDocument();
  });

  test('the first of several || joined recipe names is used as the group', () => {
    render(
      <ReviewScreen
        items={[
          {
            ItemID: 1102,
            ItemName: 'Garlic',
            Category: 'Fruit & vegetables',
            DataSource: 'MealIngredients',
            RecipeNames: 'Beef tacos||Sheet pan chicken',
          },
        ]}
        selected={new Set([1102])}
        meals={[]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText('Beef tacos')).toBeInTheDocument();
    expect(screen.queryByText(/\|\|/)).not.toBeInTheDocument();
  });

  test('the name lookup still resolves rows the derivation could not attribute', () => {
    render(
      <ReviewScreen
        items={[
          {
            ItemID: 1103,
            ItemName: 'Chicken thighs',
            Category: 'Meat & seafood',
            DataSource: 'MealIngredients',
            RecipeNames: null,
          },
        ]}
        selected={new Set([1103])}
        meals={[{ mealName: 'Chicken tacos', ingredientNames: ['Chicken thighs'] }]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText('Chicken tacos')).toBeInTheDocument();
  });

  test('a row neither source can attribute still renders, under Other meal ingredients', () => {
    render(
      <ReviewScreen
        items={[
          {
            ItemID: 1104,
            ItemName: 'Sriracha',
            Category: 'Condiments & sauces',
            DataSource: 'MealIngredients',
            RecipeNames: null,
          },
        ]}
        selected={new Set([1104])}
        meals={[]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText('Sriracha')).toBeInTheDocument();
    expect(screen.getByText('Other meal ingredients')).toBeInTheDocument();
  });

  test('IsOptional as the wire-shape number 1 renders the optional marker', () => {
    render(
      <ReviewScreen
        items={[
          {
            ItemID: 1105,
            ItemName: 'Sesame oil',
            Category: 'Condiments & sauces',
            DataSource: 'MealIngredients',
            RecipeNames: 'Sesame rice',
            IsOptional: 1,
          },
        ]}
        selected={new Set([1105])}
        meals={[]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText('optional')).toBeInTheDocument();
  });

  test('IsOptional as the wire-shape number 0 does not leak the digit into the row', () => {
    // `{0 && <span/>}` renders the literal "0" in JSX and the query COALESCEs
    // IsOptional to the number 0, so an uncoerced check prints "Bread0".
    render(
      <ReviewScreen
        items={[
          {
            ItemID: 1106,
            ItemName: 'Brown rice',
            Category: 'Pasta, rice & grains',
            DataSource: 'MealIngredients',
            RecipeNames: 'Sesame rice',
            IsOptional: 0,
          },
        ]}
        selected={new Set([1106])}
        meals={[]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText('Brown rice')).toBeInTheDocument();
    expect(screen.queryByText('optional')).not.toBeInTheDocument();
    expect(screen.queryByText(/Brown rice0/)).not.toBeInTheDocument();
  });

  // F8 — the review screen is the last look before shopping, so it needs the
  // same quantities as the list. Same shared formatter, same suppression.
  test('a meal row shows its quantity, and a digit-leading unit is not jammed on', () => {
    render(
      <ReviewScreen
        items={[
          { ItemID: 1201, ItemName: 'Ground beef', Category: 'Meat & seafood',
            DataSource: 'MealIngredients', RecipeNames: 'Beef tacos',
            QuantitySelected: 2, Unit: '1 lb package' },
        ]}
        selected={new Set([1201])}
        meals={[]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText('2 × 1 lb package')).toBeInTheDocument();
    expect(screen.queryByText(/2 1 lb package/)).not.toBeInTheDocument();
  });

  test('a plain staple at quantity 1 gains no noise', () => {
    render(
      <ReviewScreen
        items={[
          { ItemID: 1202, ItemName: 'Bread', Category: 'Bakery & bread',
            DataSource: 'Staples', QuantitySelected: 1, Unit: null },
        ]}
        selected={new Set([1202])}
        meals={[]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    // Scope to the ROW: a bare queryByText('1') also matches the section
    // header's item count, which is not what this is about.
    const row = screen.getByText('Bread');
    expect(row).toBeInTheDocument();
    expect(row.textContent).toBe('Bread');
  });

  test('slice 1: a meal row shows its recipe need, not the package guess', () => {
    render(
      <ReviewScreen
        items={[
          { ItemID: 1203, ItemName: 'Sweet peppers', Category: 'Fruit & vegetables',
            DataSource: 'MealIngredients', RecipeNames: 'Beef tacos',
            QuantitySelected: 1, Unit: '1 lb package',
            NeedOz: '4.0000000', NeedTsp: null, NeedCount: null, NeedCountUnit: null, NeedUnspecified: 0 },
        ]}
        selected={new Set([1203])}
        meals={[]}
        onToggle={() => {}}
        onRemoveOneOff={() => {}}
        onBack={() => {}}
        onStartShopping={() => {}}
      />
    );
    expect(screen.getByText('4 oz')).toBeInTheDocument();
    expect(screen.queryByText(/lb package/)).not.toBeInTheDocument();
  });
});
