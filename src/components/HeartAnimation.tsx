"use client";

import { motion } from "framer-motion";
import { MessageCircleCode } from "lucide-react";

export default function HeartAnimation() {
    return (
        <div className="flex items-center gap-1.5 px-2">
            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    animate={{
                        scale: [1, 1.4, 1],
                        opacity: [0.4, 1, 0.4],
                    }}
                    transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.2,
                        ease: "easeOut"
                    }}
                >
                    <MessageCircleCode className="w-4 h-4 text-[#FFFC00] fill-[#FFFC00] stroke-black stroke-[1.5px]" />
                </motion.div>
            ))}
        </div>
    );
}
