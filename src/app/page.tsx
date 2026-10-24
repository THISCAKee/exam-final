// app/page.tsx
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ATTEMPT_TOKEN_KEY, examRequest } from "./lib/exam-session";

export default function Home() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [section, setSection] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const starting = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (starting.current) return;
    if (!firstName.trim() || !lastName.trim() || !studentId.trim() || !section.trim()) {
      setError("กรุณากรอกข้อมูลให้ครบทุกช่อง");
      return;
    }
    starting.current = true;
    setIsStarting(true);
    setError("");
    try {
      const result = await examRequest<{ token: string }>("start", {
        firstName, lastName, studentId, section,
      });
      sessionStorage.setItem(ATTEMPT_TOKEN_KEY, result.token);
      router.push("/exam");
    } catch (error) {
      setError(error instanceof Error ? error.message : "ไม่สามารถเริ่มสอบได้");
      starting.current = false;
      setIsStarting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-100 text-black">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">
          ระบบทำข้อสอบออนไลน์
        </h1>
        <p className="mb-4 text-center text-gray-700">ข้อสอบ 80 ข้อ คะแนนเต็ม 80 คะแนน เวลา 60 นาที</p>
        <p className="mb-4 text-sm text-red-700">เข้าสอบได้ครั้งเดียว เมื่อส่งคำตอบ หมดเวลา ปิดหน้าเว็บ หรือรีเฟรช จะไม่สามารถเข้าสอบใหม่ได้</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="firstName"
              className="block text-sm font-medium text-gray-700"
            >
              ชื่อ
            </label>
            <input
              type="text"
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label
              htmlFor="lastName"
              className="block text-sm font-medium text-gray-700"
            >
              นามสกุล
            </label>
            <input
              type="text"
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label
              htmlFor="studentId"
              className="block text-sm font-medium text-gray-700"
            >
              รหัสนิสิต
            </label>
            <input
              type="text"
              id="studentId"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label
              htmlFor="section"
              className="block text-sm font-medium text-gray-700"
            >
              กลุ่มเรียน
            </label>
            <input
              type="text"
              id="section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          {error && <p role="alert" className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={isStarting}
            className="w-full py-2 px-4 bg-indigo-600 text-white font-semibold rounded-md shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            {isStarting ? "กำลังตรวจสอบสิทธิ์สอบ..." : "เริ่มทำข้อสอบ"}
          </button>
        </form>
      </div>
    </main>
  );
}
