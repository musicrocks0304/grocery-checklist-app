import React from "react";
import { Check, Undo2 } from "lucide-react";
import { motion } from "framer-motion";

const UndoToast = ({ itemName, onUndo }) => (
  <motion.div
    initial={{ y: 20, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    exit={{ y: 20, opacity: 0 }}
    transition={{ duration: 0.24, ease: "easeOut" }}
    className="fixed left-3.5 right-3.5 bottom-[18px] z-20 bg-heading text-white rounded-[14px] px-3.5 py-3 flex items-center gap-2.5 shadow-warm-xl"
  >
    <Check size={18} strokeWidth={3} className="text-[#A8D5BD] flex-shrink-0" />
    <span className="flex-1 text-[14px]">
      Got <b>{itemName}</b>
    </span>
    <button
      type="button"
      onClick={onUndo}
      className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#A8D5BD] px-2 py-1"
    >
      <Undo2 size={14} />
      UNDO
    </button>
  </motion.div>
);

export default UndoToast;
