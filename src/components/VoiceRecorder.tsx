"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Square, Trash2, Send, Play, Pause, Loader2 } from "lucide-react";
// Removed Firebase imports
import { motion, AnimatePresence } from "framer-motion";
import { sendMessage } from "@/actions/chat";

export default function VoiceRecorder({ user, receiverId, isSelfDestructing }: { user: any, receiverId: string, isSelfDestructing: boolean }) {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioURL, setAudioURL] = useState<string | null>(null);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [isPlayingPreview, setIsPlayingPreview] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [visualizerData, setVisualizerData] = useState<number[]>(Array(15).fill(20));

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (isRecording) {
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
            startVisualizer();
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
            stopVisualizer();
            setRecordingTime(0);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            stopVisualizer();
        };
    }, [isRecording]);

    const startVisualizer = async () => {
        try {
            const stream = mediaRecorderRef.current?.stream;
            if (!stream) return;

            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContextRef.current.createMediaStreamSource(stream);
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 64;
            source.connect(analyserRef.current);

            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const update = () => {
                if (!analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(dataArray);

                const buckets = Array(15).fill(0);
                const step = Math.floor(bufferLength / 15);
                for (let i = 0; i < 15; i++) {
                    buckets[i] = dataArray[i * step] / 255 * 80 + 20;
                }
                setVisualizerData(buckets);
                animationFrameRef.current = requestAnimationFrame(update);
            };
            update();
        } catch (err) {
            console.error("Visualizer error:", err);
        }
    };

    const stopVisualizer = () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
            audioContextRef.current.close();
        }
        setVisualizerData(Array(15).fill(20));
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const mimeType = mediaRecorder.mimeType || "audio/webm";
                const blob = new Blob(chunksRef.current, { type: mimeType });
                console.log("Recording stopped. Blob created:", { size: blob.size, type: mimeType });
                setAudioBlob(blob);
                setAudioURL(URL.createObjectURL(blob));

                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Mic access error:", err);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
    };

    const cancelRecording = () => {
        if (isPlayingPreview) stopPreview();
        setAudioURL(null);
        setAudioBlob(null);
        setIsSending(false);
    };

    const togglePreview = () => {
        if (isPlayingPreview) {
            stopPreview();
        } else {
            startPreview();
        }
    };

    const startPreview = () => {
        if (!audioURL) return;
        previewAudioRef.current = new Audio(audioURL);
        previewAudioRef.current.onended = () => setIsPlayingPreview(false);
        previewAudioRef.current.play();
        setIsPlayingPreview(true);
    };

    const stopPreview = () => {
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
        }
        setIsPlayingPreview(false);
    };

    const uploadVoice = async () => {
        console.log("Starting upload...", { hasBlob: !!audioBlob, size: audioBlob?.size, uid: user?.uid, receiverId });
        if (!audioBlob || !user || isSending) return;

        if (!receiverId || receiverId === "") {
            console.error("Missing receiverId - cannot send message");
            alert("Erreur: Destinataire introuvable.");
            setIsSending(false);
            return;
        }

        setIsSending(true);

        try {
            // Convert Blob to Base64
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);

            reader.onloadend = async () => {
                const base64Url = reader.result as string;

                // Save to Prisma
                try {
                    await sendMessage({
                        content: base64Url,
                        type: "audio",
                        senderId: user.uid,
                        receiverId,
                        isSelfDestructing
                    });
                    console.log("Audio sent to Prisma!");
                    cancelRecording();
                } catch (prismaErr) {
                    console.error("Prisma save error:", prismaErr);
                    alert("Erreur lors de l'envoi.");
                }
                setIsSending(false);
            };
        } catch (err: any) {
            console.error("Upload error details:", err);
            alert("Erreur lors de l'envoi: " + (err.message || "Problème inconnu"));
            setIsSending(false);
        }
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    return (
        <div className="flex items-center relative">
            <AnimatePresence>
                {/* Floating UI for Recording/Reviewing */}
                {(isRecording || audioURL) && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-[340px] bg-white rounded-3xl shadow-2xl border border-gray-100 p-4 z-50 flex flex-col items-center gap-4"
                    >
                        {isRecording ? (
                            <div className="flex flex-col items-center gap-4 w-full">
                                <div className="flex items-end gap-[4px] h-12">
                                    {visualizerData.map((h, i) => (
                                        <motion.div
                                            key={i}
                                            className="w-1.5 bg-[#00B9FF] rounded-full"
                                            animate={{ height: `${h}%` }}
                                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                        />
                                    ))}
                                </div>
                                <div className="flex items-center gap-6">
                                    <span className="text-xl font-black text-black tabular-nums">
                                        {formatTime(recordingTime)}
                                    </span>
                                    <button
                                        onClick={stopRecording}
                                        className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform"
                                    >
                                        <Square className="w-6 h-6 fill-white" />
                                    </button>
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest animate-pulse">Enregistrement en cours...</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-5 w-full">
                                <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-[#00B9FF]"
                                        initial={{ width: 0 }}
                                        animate={{ width: isPlayingPreview ? "100%" : "0%" }}
                                        transition={{ duration: 1, ease: "linear" }}
                                    />
                                </div>

                                <div className="flex items-center justify-between w-full px-4">
                                    <button
                                        onClick={cancelRecording}
                                        className="w-12 h-12 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>

                                    <button
                                        onClick={togglePreview}
                                        className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl active:scale-90 transition-transform ${isPlayingPreview ? "bg-black" : "bg-[#00B9FF]"
                                            }`}
                                    >
                                        {isPlayingPreview ? <Pause className="w-7 h-7 fill-white" /> : <Play className="w-7 h-7 fill-white ml-1" />}
                                    </button>

                                    <button
                                        onClick={uploadVoice}
                                        disabled={isSending}
                                        className="w-12 h-12 bg-[#00B9FF] text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform disabled:opacity-50"
                                    >
                                        {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 fill-white" />}
                                    </button>
                                </div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Réécoute ton vocal</p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <button
                onClick={startRecording}
                disabled={isRecording || !!audioURL}
                className="p-2.5 text-gray-400 hover:text-[#00B9FF] transition-colors disabled:opacity-30"
            >
                <Mic className="w-6 h-6" />
            </button>
        </div>
    );
}
