import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowLeft, Clock, CheckCircle } from 'lucide-react';

const RecipeInstructions = ({ onNavigate }) => {
  // Sample data based on the provided schema and screenshot
  const sampleRecipeData = {
    recipe_id: 123,
    recipe_name: "Delicious Pasta with Tomato Sauce",
    instructions: [
      {
        instruction_id: 1,
        recipe_id: 123,
        step_number: 1,
        instruction_text: "Prepare the ingredients: Wash and dry the fresh produce. Heat a large pot of salted water to boiling on high. Peel and mince the garlic. Cut off and discard the stem of the bell pepper. Halve lengthwise; remove the ribs and seeds, then medium dice. Cut off and discard the root end of the scallion; thinly slice, separating the white bottoms and hollow green tops.",
        time_minutes: 15
      },
      {
        instruction_id: 2,
        recipe_id: 123,
        step_number: 2,
        instruction_text: "Cook the aromatics: In a large, high-sided pan (or pot), heat a drizzle of olive oil on medium until hot. Add the garlic and cook, stirring frequently, 30 seconds to 1 minute, or until fragrant.",
        time_minutes: 4
      },
      {
        instruction_id: 3,
        recipe_id: 123,
        step_number: 3,
        instruction_text: "Add the tomato paste: Add the tomato paste to the pan; season with salt and pepper. Cook, stirring frequently, 2 to 3 minutes, or until dark red and fragrant.",
        time_minutes: 3
      },
      {
        instruction_id: 4,
        recipe_id: 123,
        step_number: 4,
        instruction_text: "Add the beef: Add the ground beef to the pan; season with salt and pepper. Cook, frequently breaking the meat apart with a spoon, 7 to 9 minutes, or until browned and cooked through.",
        time_minutes: 8
      },
      {
        instruction_id: 5,
        recipe_id: 123,
        step_number: 5,
        instruction_text: "Cook the pasta: While the beef cooks, add the pasta to the pot of boiling water. Cook, stirring occasionally, 8 to 10 minutes, or until just shy of al dente (still slightly firm to the bite). Turn off the heat. Reserving 1/2 cup of the pasta cooking water, drain thoroughly and rinse under cold water to prevent sticking.",
        time_minutes: 9
      },
      {
        instruction_id: 6,
        recipe_id: 123,
        step_number: 6,
        instruction_text: "Finish the pasta & plate your dish: Add the Brussels sprouts and 1/2 of the reserved pasta cooking water to the pan; season with salt and pepper. Cook, stirring frequently, 2 to 3 minutes, or until the Brussels sprouts are slightly softened. Add the cooked pasta and cook, stirring frequently, 1 to 2 minutes, or until the pasta is coated (if the sauce seems dry, gradually add the remaining cooking water to achieve your desired consistency). Turn off the heat. Taste, then season with salt and pepper if desired. Serve the finished pasta garnished with the Parmesan cheese. Enjoy!",
        time_minutes: 4
      },
      {
        instruction_id: 7,
        recipe_id: 123,
        step_number: 7,
        instruction_text: "Prepare the ingredients: Meanwhile, wash and dry the peppers; cut into 1-inch pieces. Remove the cores; halve lengthwise, then cut crosswise into 1/2-inch pieces. Add 2 tablespoons of olive oil to a large pan and heat on medium-high until hot.",
        time_minutes: 5
      },
      {
        instruction_id: 8,
        recipe_id: 123,
        step_number: 8,
        instruction_text: "Make the filling: In a medium bowl, combine the ground turkey, breadcrumbs, and egg. Season with salt and pepper; stir to combine. Using your hands, form the mixture into 1-inch meatballs (you should have 12 to 14 meatballs).",
        time_minutes: 5
      },
      {
        instruction_id: 9,
        recipe_id: 123,
        step_number: 9,
        instruction_text: "Assemble & bake the enchiladas: Add 2 tablespoons of the tomato paste (you will have extra), 1/4 teaspoon of the spice blend, and as much of the chile paste as you'd like, depending on how spicy you'd like the dish to be. Season with salt and pepper; stir to combine. Cook, stirring constantly, 30 seconds to 1 minute, or until fragrant.",
        time_minutes: 12
      },
      {
        instruction_id: 10,
        recipe_id: 123,
        step_number: 10,
        instruction_text: "Season the yogurt & serve your dish: Meanwhile, season the remaining yogurt with salt and pepper. Serve the baked enchiladas with the seasoned yogurt on the side. Enjoy!",
        time_minutes: 2
      }
    ]
  };

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  const currentInstruction = sampleRecipeData.instructions[currentStep];
  const totalSteps = sampleRecipeData.instructions.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleStepComplete = () => {
    const newCompleted = new Set(completedSteps);
    if (completedSteps.has(currentStep)) {
      newCompleted.delete(currentStep);
    } else {
      newCompleted.add(currentStep);
    }
    setCompletedSteps(newCompleted);
  };

  const handleBackToApp = () => {
    onNavigate('grocery');
  };

  const handleJumpToStep = (stepIndex) => {
    setCurrentStep(stepIndex);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={handleBackToApp}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="font-medium">Back to App</span>
            </button>
            <div className="text-center">
              <h1 className="text-lg font-bold text-gray-800 truncate max-w-xs">
                {sampleRecipeData.recipe_name}
              </h1>
              <p className="text-sm text-gray-500">
                Step {currentStep + 1} of {totalSteps}
              </p>
            </div>
            <div className="w-20"></div> {/* Spacer for centering */}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-orange-500 to-red-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Step Numbers Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex flex-wrap gap-2 justify-center">
            {sampleRecipeData.instructions.map((_, index) => (
              <button
                key={index}
                onClick={() => handleJumpToStep(index)}
                className={`w-10 h-10 rounded-full font-bold text-sm transition-all duration-200 ${
                  index === currentStep
                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg scale-110'
                    : completedSteps.has(index)
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
                title={`Jump to step ${index + 1}`}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-gray-500 mt-2">
            Tap any number to jump to that step
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Step Header */}
          <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Step {currentStep + 1}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <Clock size={16} />
                  <span className="text-orange-100">
                    {currentInstruction.time_minutes} minute{currentInstruction.time_minutes !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <button
                onClick={handleStepComplete}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  completedSteps.has(currentStep)
                    ? 'bg-green-500 text-white'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                <CheckCircle size={16} />
                {completedSteps.has(currentStep) ? 'Completed' : 'Mark Complete'}
              </button>
            </div>
          </div>

          {/* Instruction Text */}
          <div className="p-6">
            <p className="text-lg leading-relaxed text-gray-700 font-medium">
              {currentInstruction.instruction_text}
            </p>
          </div>

          {/* Navigation */}
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
            <button
              onClick={handlePrevious}
              disabled={isFirstStep}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                isFirstStep
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
            >
              <ChevronLeft size={20} />
              Previous
            </button>

            <div className="text-center">
              <p className="text-sm text-gray-500">
                {completedSteps.size} of {totalSteps} steps completed
              </p>
            </div>

            <button
              onClick={handleNext}
              disabled={isLastStep}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                isLastStep
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600'
              }`}
            >
              Next
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Recipe Complete Message */}
        {isLastStep && completedSteps.has(currentStep) && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-green-800 mb-2">Recipe Complete!</h3>
            <p className="text-green-700">
              Congratulations! You've finished preparing {sampleRecipeData.recipe_name}.
            </p>
            <button
              onClick={handleBackToApp}
              className="mt-4 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Back to App
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipeInstructions;
