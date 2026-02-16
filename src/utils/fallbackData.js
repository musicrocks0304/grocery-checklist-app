/**
 * Fallback/sample data used when webhook calls fail.
 * Clearly labeled as fallback content — not real user data.
 */

export const GROCERY_SAMPLE_DATA = [
  {
    ItemID: 1,
    ItemName: "Grapes",
    Category: "Lunches",
    Store: "Tom Thumb",
    GroceryStoreSection: "Produce",
  },
  {
    ItemID: 2,
    ItemName: "Pastry Pups",
    Category: "Lunches",
    Store: "Trader Joe's",
    GroceryStoreSection: "Frozen",
  },
  {
    ItemID: 3,
    ItemName: "Almond Milk",
    Category: "Breakfast",
    Store: "Whole Foods",
    GroceryStoreSection: "Refrigerated",
  },
  {
    ItemID: 4,
    ItemName: "BelVita Breakfast biscuits",
    Category: "Snacks",
    Store: "Kroger",
    GroceryStoreSection: "Snacks",
  },
  {
    ItemID: 5,
    ItemName: "Peanut Butter",
    Category: "General",
    Store: "Costco",
    GroceryStoreSection: "Pantry",
  },
];

export const RECIPE_INSTRUCTIONS_SAMPLE_DATA = {
  recipe_id: 123,
  name: "Delicious Pasta with Tomato Sauce",
  recipe_name: "Delicious Pasta with Tomato Sauce",
  totalTime: "67 mins",
  instructions: [
    { id: 1, step: 1, instruction: "Prepare the ingredients: Wash and dry the fresh produce. Heat a large pot of salted water to boiling on high.", time: "15 mins", time_minutes: 15, ingredients: [] },
    { id: 2, step: 2, instruction: "Cook the aromatics: In a large pan, heat a drizzle of olive oil on medium until hot. Add the garlic and cook, stirring frequently, until fragrant.", time: "4 mins", time_minutes: 4, ingredients: [] },
    { id: 3, step: 3, instruction: "Add the tomato paste to the pan; season with salt and pepper. Cook, stirring frequently, 2 to 3 minutes, or until dark red and fragrant.", time: "3 mins", time_minutes: 3, ingredients: [] },
    { id: 4, step: 4, instruction: "Add the ground beef to the pan; season with salt and pepper. Cook, breaking the meat apart with a spoon, until browned and cooked through.", time: "8 mins", time_minutes: 8, ingredients: [] },
    { id: 5, step: 5, instruction: "While the beef cooks, add the pasta to the boiling water. Cook until just shy of al dente. Reserve 1/2 cup cooking water, then drain.", time: "9 mins", time_minutes: 9, ingredients: [] },
    { id: 6, step: 6, instruction: "Add the Brussels sprouts and reserved cooking water to the pan. Cook until slightly softened, then add the pasta and toss to coat.", time: "4 mins", time_minutes: 4, ingredients: [] },
    { id: 7, step: 7, instruction: "Meanwhile, wash and dry the peppers; cut into 1-inch pieces. Heat 2 tablespoons of olive oil in a large pan on medium-high.", time: "5 mins", time_minutes: 5, ingredients: [] },
    { id: 8, step: 8, instruction: "In a medium bowl, combine the ground turkey, breadcrumbs, and egg. Season and form into 1-inch meatballs.", time: "5 mins", time_minutes: 5, ingredients: [] },
    { id: 9, step: 9, instruction: "Add tomato paste, spice blend, and chile paste to taste. Season and cook, stirring constantly, until fragrant.", time: "12 mins", time_minutes: 12, ingredients: [] },
    { id: 10, step: 10, instruction: "Season the remaining yogurt with salt and pepper. Serve the dish with the seasoned yogurt on the side. Enjoy!", time: "2 mins", time_minutes: 2, ingredients: [] },
  ],
};
