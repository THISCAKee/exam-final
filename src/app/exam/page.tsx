// app/exam/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { allQuestions, Question } from "../lib/questions";

// --- (Interface และฟังก์ชัน helpers) ---

interface UserInfo {
  firstName: string;
  lastName: string;
  studentId: string;
  section: string;
}

// ฟังก์ชันสำหรับสุ่ม Array (Fisher-Yates Shuffle)
const shuffleArray = <T,>(array: T[]): T[] => {
  const newArray = [...array]; // สร้าง copy เพื่อไม่แก้ไข array เดิม
  let currentIndex = newArray.length,
    randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [newArray[currentIndex], newArray[randomIndex]] = [
      newArray[randomIndex],
      newArray[currentIndex],
    ];
  }
  return newArray;
};

// ตัวเลือก ก, ข, ค, ง
const optionKeys = ["ก", "ข", "ค", "ง"];

// --- (Key สำหรับ localStorage) ---
const USER_INFO_KEY = "examUser";
const EXAM_STATE_KEY = "examState";

interface ExamState {
  shuffledQuestions: Question[];
  currentQuestionIndex: number;
  answers: string[];
  deadline: number; // เก็บเป็น timestamp (ตัวเลข)
}

// --- (Component หลัก) ---

export default function ExamPage() {
  const router = useRouter();

  // --- (States ทั้งหมด) ---
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true); // <--- สำคัญมาก
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [shuffledQuestions, setShuffledQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(60 * 60); // 60 นาที (ค่าเริ่มต้น)
  const [examDeadline, setExamDeadline] = useState<number | null>(null);

  // --- (ฟังก์ชันส่งข้อสอบ) ---
  const submitExam = useCallback(
    async (finalAnswers: string[]): Promise<boolean> => {
      if (isSubmitting || !userInfo) return false;
      setIsSubmitting(true);

      const questionOrder = shuffledQuestions.map((q) => q.id);
      const userAnswers = shuffledQuestions.map((q, index) => {
        const answer = finalAnswers[index];
        if (answer === null || answer === undefined || answer === "") {
          return "ไม่ได้ตอบ";
        }
        return optionKeys[parseInt(answer)];
      });

      try {
        await fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...userInfo,
            userAnswers: userAnswers,
            questionOrder: questionOrder,
          }),
        });

        // +++ สำคัญ: ล้าง state เมื่อส่งสำเร็จ +++
        localStorage.removeItem(USER_INFO_KEY);
        localStorage.removeItem(EXAM_STATE_KEY);
        return true; // คืนค่าว่าส่งสำเร็จ
      } catch (error) {
        console.error("Failed to submit exam:", error);
        alert("เกิดข้อผิดพลาดในการส่งคำตอบ โปรดติดต่ออาจารย์");
        setIsSubmitting(false);
        return false; // คืนค่าว่าส่งล้มเหลว
      }
    },
    [isSubmitting, userInfo, shuffledQuestions], // ลบ router ออก
  );

  // --- (Hook 1: โหลดข้อมูลผู้ใช้ และ สถานะการสอบ) ---
  useEffect(() => {
    console.log("Loading state...");
    try {
      // 1. โหลดข้อมูลผู้ใช้
      const storedUser = localStorage.getItem(USER_INFO_KEY);
      if (!storedUser) {
        router.replace("/");
        return;
      }
      setUserInfo(JSON.parse(storedUser));

      // 2. โหลดสถานะการสอบ (ถ้ามี)
      const storedExamState = localStorage.getItem(EXAM_STATE_KEY);

      if (storedExamState) {
        // --- กรณีรีเฟรช: โหลด state เดิม ---
        console.log("Found existing exam state. Resuming...");
        const state: ExamState = JSON.parse(storedExamState);

        setShuffledQuestions(state.shuffledQuestions);
        setCurrentQuestionIndex(state.currentQuestionIndex);
        setAnswers(state.answers);
        setExamDeadline(state.deadline);

        // โหลดคำตอบของข้อปัจจุบัน (ถ้าเคยตอบไว้)
        setSelectedOption(state.answers[state.currentQuestionIndex] || null);
      } else {
        // --- กรณีเริ่มใหม่: สร้าง state ใหม่ ---
        console.log("No exam state found. Starting new exam...");
        const newShuffledQuestions = shuffleArray([...allQuestions]);
        const newDeadline = new Date().getTime() + 60 * 60 * 1000; // 60 นาที
        const newAnswers = Array(newShuffledQuestions.length).fill("");

        setShuffledQuestions(newShuffledQuestions);
        setExamDeadline(newDeadline);
        setAnswers(newAnswers);

        // บันทึก state ใหม่ลง localStorage
        const newState: ExamState = {
          shuffledQuestions: newShuffledQuestions,
          currentQuestionIndex: 0,
          answers: newAnswers,
          deadline: newDeadline,
        };
        localStorage.setItem(EXAM_STATE_KEY, JSON.stringify(newState));
      }
    } catch (error) {
      console.error("Error loading state:", error);
      localStorage.removeItem(USER_INFO_KEY);
      localStorage.removeItem(EXAM_STATE_KEY);
      router.replace("/");
    } finally {
      setIsLoading(false); // โหลดเสร็จแล้ว
    }
  }, [router]);

  // --- (Hook 2: จัดการ Timer) ---
  useEffect(() => {
    // รอจนกว่าจะโหลด state (Hook 1) เสร็จ และมี deadline
    if (isLoading || isSubmitting || !examDeadline) {
      return;
    }

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const newTimeLeft = Math.floor((examDeadline - now) / 1000);

      if (newTimeLeft <= 0) {
        // --- หมดเวลา ---
        clearInterval(timer);
        setTimeLeft(0);
        if (!isSubmitting) {
          // ป้องกันการส่งซ้ำซ้อน
          console.log("Time's up! Submitting...");
          submitExam(answers).then((success) => {
            if (success) {
              router.push("/done?status=timeout");
            }
          });
        }
      } else {
        // --- ยังมีเวลา ---
        setTimeLeft(newTimeLeft);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isLoading, isSubmitting, examDeadline, submitExam, answers, router]);

  // --- (ฟังก์ชันจัดการการตอบ) ---
  const handleSelectOption = (optionIndex: string) => {
    setSelectedOption(optionIndex);

    // บันทึกคำตอบลง State ชั่วคราว (ยังไม่ลง localStorage)
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = optionIndex;
    setAnswers(newAnswers);
  };

  const handleNextQuestion = () => {
    // (คำตอบถูกบันทึกไปแล้วใน handleSelectOption)

    // รีเซ็ตตัวเลือก
    setSelectedOption(null);

    if (currentQuestionIndex < shuffledQuestions.length - 1) {
      // --- ไปข้อถัดไป ---
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);

      // โหลดคำตอบของข้อถัดไป (ถ้าเคยตอบไว้)
      setSelectedOption(answers[nextIndex] || null);

      // +++ บันทึก State ล่าสุดลง localStorage +++
      try {
        const currentState = JSON.parse(
          localStorage.getItem(EXAM_STATE_KEY) || "{}",
        );
        currentState.currentQuestionIndex = nextIndex;
        currentState.answers = answers; // answers ถูกอัปเดตแล้วจาก handleSelectOption
        localStorage.setItem(EXAM_STATE_KEY, JSON.stringify(currentState));
      } catch (e) {
        console.error("Failed to save state", e);
      }
    } else {
      // --- ข้อสุดท้าย: ส่งข้อสอบ ---
      console.log("Finished. Submitting...");
      submitExam(answers).then((success) => {
        if (success) {
          router.push("/done?status=completed");
        }
      });
    }
  };

  // --- (ส่วนการแสดงผล) ---

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        กำลังโหลดสถานะการสอบ...
      </div>
    );
  }

  if (isSubmitting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        กำลังส่งคำตอบ...
      </div>
    );
  }

  // ป้องกันกรณี state ยังโหลดไม่เสร็จ (เกิดขึ้นได้ยาก)
  if (shuffledQuestions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        เกิดข้อผิดพลาดในการโหลดข้อสอบ
      </div>
    );
  }

  const currentQuestion: Question = shuffledQuestions[currentQuestionIndex];
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-md p-4 sticky top-0 z-10">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-black">
            ข้อ {currentQuestionIndex + 1} / {shuffledQuestions.length}
          </h1>
          <div className="text-xl font-bold text-red-600">
            เวลาที่เหลือ: {String(minutes).padStart(2, "0")}:
            {String(seconds).padStart(2, "0")}
          </div>
        </div>
      </header>

      {/* Question Area */}
      <main className="container mx-auto p-6 grow">
        <div className="bg-white p-8 rounded-lg shadow-lg">
          <h2 className="text-2xl font-semibold mb-6 text-black">
            {currentQuestion.question}
          </h2>
          <div className="space-y-4">
            {currentQuestion.options.map((option, index) => {
              const optionKey = optionKeys[index];
              const isSelected = selectedOption === String(index);

              return (
                <label
                  key={index}
                  className={`block w-full p-4 border rounded-lg cursor-pointer text-black
                                ${
                                  isSelected
                                    ? "border-indigo-600 bg-indigo-50"
                                    : "border-gray-300 hover:bg-gray-50"
                                }`}
                >
                  <input
                    type="radio"
                    name="option"
                    value={index}
                    checked={isSelected}
                    onChange={(e) => handleSelectOption(e.target.value)} // <--- เปลี่ยนฟังก์ชัน
                    className="sr-only"
                  />
                  <span
                    className={`font-bold mr-2 ${
                      isSelected ? "text-indigo-800" : ""
                    }`}
                  >
                    {optionKey}.
                  </span>
                  <span className={isSelected ? "text-indigo-800" : ""}>
                    {option}
                  </span>
                </label>
              );
            })}
          </div>

          <button
            onClick={handleNextQuestion}
            disabled={selectedOption === null}
            className="mt-8 w-full py-3 px-6 bg-indigo-600 text-white font-bold rounded-lg shadow-md
                           hover:bg-indigo-700
                           disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {currentQuestionIndex === shuffledQuestions.length - 1
              ? "ส่งคำตอบ"
              : "ข้อถัดไป"}
          </button>
        </div>
      </main>
    </div>
  );
}
