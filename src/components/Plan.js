import React from 'react';
import StaplesScreen from './StaplesScreen';

const Plan = ({ onNavigate }) => {
  return <StaplesScreen onReview={() => onNavigate('shop')} />;
};

export default Plan;
