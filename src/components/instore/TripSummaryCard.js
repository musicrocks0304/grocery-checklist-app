import React, { useEffect } from "react";
import { Clock, Check, ShoppingBag, Tag, PartyPopper } from "lucide-react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { fadeIn, modalSpring, staggerContainer, staggerItem } from "../../utils/animations";

// Trip summary celebration card (confetti + stats) — preserved from the
// previous implementation; triggers when every item is checked off.
const TripSummaryCard = ({ totalItems, sectionsCleared, totalSections, shoppingMinutes, couponSavings, onExit }) => {
  useEffect(() => {
    const colors = ["#5B8A72", "#7CB896", "#C17849", "#E09565", "#f59e0b"];
    const fire = () => {
      confetti({ particleCount: 80, spread: 70, origin: { x: 0.1, y: 0.6 }, colors });
      confetti({ particleCount: 80, spread: 70, origin: { x: 0.9, y: 0.6 }, colors });
    };
    const t1 = setTimeout(fire, 400);
    const t2 = setTimeout(fire, 700);
    const t3 = setTimeout(() => {
      confetti({ particleCount: 120, spread: 100, origin: { x: 0.5, y: 0.4 }, colors });
    }, 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const stats = [
    { icon: Clock, label: "Shopping Time", value: shoppingMinutes < 1 ? "Under 1 min" : `${shoppingMinutes} min` },
    { icon: Check, label: "Items Checked", value: `${totalItems}` },
    { icon: ShoppingBag, label: "Aisles Cleared", value: `${sectionsCleared}/${totalSections}` },
  ];
  if (couponSavings > 0) {
    stats.push({ icon: Tag, label: "Coupon Savings", value: `$${couponSavings.toFixed(2)}` });
  }

  return (
    <motion.div {...fadeIn} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <motion.div {...modalSpring} className="bg-surface rounded-2xl shadow-warm-xl p-6 max-w-sm w-full">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
          className="flex items-center justify-center gap-2 mb-6"
        >
          <PartyPopper size={28} className="text-primary" />
          <h2 className="text-2xl font-bold font-display text-heading">All Done!</h2>
          <PartyPopper size={28} className="text-primary" />
        </motion.div>
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3 mb-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <motion.div key={stat.label} variants={staggerItem} className="flex items-center gap-3 p-3 rounded-xl bg-background">
                <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted">{stat.label}</p>
                  <p className="text-lg font-bold text-heading">{stat.value}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.3 }}
          onClick={onExit}
          className="w-full py-3.5 bg-primary text-white rounded-xl font-bold text-lg hover:bg-primary-hover transition-colors min-h-[56px]"
        >
          Return to Planner
        </motion.button>
      </motion.div>
    </motion.div>
  );
};

export default TripSummaryCard;
