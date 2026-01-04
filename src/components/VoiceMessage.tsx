"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2 } from "lucide-react";
import { motion } from "framer-motion";

interface VoiceMessageProps {
    url: string;
    isMe: boolean;
}

export default function VoiceMessage({ url, isMe }: VoiceMessageProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateProgress = () => {
            setProgress((audio.currentTime / audio.duration) * 100);
        };

        const onLoadedMetadata = () => {
            setDuration(audio.duration);
        };

        const onEnded = () => {
            setIsPlaying(false);
            setProgress(0);
        };

        audio.addEventListener("timeupdate", updateProgress);
        audio.addEventListener("loadedmetadata", onLoadedMetadata);
        audio.addEventListener("ended", onEnded);

        return () => {
            audio.removeEventListener("timeupdate", updateProgress);
            audio.removeEventListener("loadedmetadata", onLoadedMetadata);
            audio.removeEventListener("ended", onEnded);
        };
    }, [url]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    return (
        <div className={`flex items-center gap-3 py-2 px-1 min-w-[160px]`}>
            <audio ref={audioRef} src={url} preload="metadata" />

            <button
                onClick={togglePlay}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isMe ? "bg-white/20 hover:bg-white/30" : "bg-black/5 hover:bg-black/10"
                    }`}
            >
                {isPlaying ? (
                    <Pause className={`w-5 h-5 ${isMe ? "text-white" : "text-[#00B9FF]"} fill-current`} />
                ) : (
                    <Play className={`w-5 h-5 ${isMe ? "text-white" : "text-[#00B9FF]"} fill-current ml-0.5`} />
                )}
            </button>

            <div className="flex-1 flex flex-col gap-1.5">
                {/* Visualizer bars (Snapchat style) */}
                <div className="flex items-end gap-[2px] h-6">
                    {[...Array(15)].map((_, i) => {
                        const active = (progress / 100) * 15 > i;
                        return (
                            <div
                                key={i}
                                className={`w-1 rounded-full transition-all duration-300 ${active
                                        ? (isMe ? "bg-white" : "bg-[#00B9FF]")
                                        : (isMe ? "bg-white/30" : "bg-gray-300")
                                    }`}
                                style={{
                                    height: `${20 + Math.sin(i * 0.8) * 40 + (active && isPlaying ? Math.random() * 20 : 0)}%`,
                                    opacity: 0.5 + (active ? 0.5 : 0)
                                }}
                            />
                        );
                    })}
                </div>

                <div className="flex justify-between items-center px-0.5">
                    <span className={`text-[9px] font-bold uppercase tracking-tighter ${isMe ? "text-white/70" : "text-gray-400"}`}>
                        {duration ? `${Math.floor(duration)}s` : "..."}
                    </span>
                    <Volume2 className={`w-3 h-3 ${isMe ? "text-white/40" : "text-gray-300"}`} />
                </div>
            </div>
        </div>
    );
}
