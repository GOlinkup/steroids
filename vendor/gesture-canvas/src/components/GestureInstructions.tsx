import React from 'react';
import { motion } from 'framer-motion';

const instructions = [
  {
    icon: "☝️",
    title: "Draw",
    desc: "Index finger only",
    color: "bg-blue-50 text-blue-600 border-blue-100"
  },
  {
    icon: "✌️",
    title: "Eraser",
    desc: "Two fingers extended",
    color: "bg-purple-50 text-purple-600 border-purple-100"
  },
  {
    icon: "🖖",
    title: "Color",
    desc: "Three fingers",
    color: "bg-green-50 text-green-600 border-green-100"
  },
  {
    icon: "🖐️",
    title: "Clear",
    desc: "Open hand (hold)",
    color: "bg-amber-50 text-amber-600 border-amber-100"
  },
  {
    icon: "✊",
    title: "Pause",
    desc: "Closed fist",
    color: "bg-red-50 text-red-600 border-red-100"
  }
];

const GestureInstructions: React.FC = () => {
  return (
    <div className="w-full">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {instructions.map((item, index) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ y: -5, scale: 1.02 }}
            className={`
              relative overflow-hidden rounded-xl border p-4
              flex flex-col items-center text-center cursor-help
              transition-shadow hover:shadow-soft-md bg-white
              ${item.color}
            `}
          >
            <div className="text-2xl mb-2 filter drop-shadow-sm">{item.icon}</div>
            <h3 className="font-bold text-sm mb-1">{item.title}</h3>
            <p className="text-[10px] uppercase tracking-wide font-semibold opacity-80">{item.desc}</p>
          </motion.div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-4 opacity-60">
        Tip: Ensure your hand is well-lit and clearly visible to the camera
      </p>
    </div>
  );
};

export default GestureInstructions;
