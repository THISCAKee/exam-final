// app/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [section, setSection] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !studentId || !section) {
      setError("กรุณากรอกข้อมูลให้ครบทุกช่อง");
      return;
    }

    // เก็บข้อมูลผู้ใช้ไว้ใน localStorage เพื่อนำไปใช้หน้าถัดไป
    // นี่เป็นวิธีง่ายๆ (วิธีที่ดีกว่าคือใช้ state management)
    try {
      localStorage.setItem(
        "examUser",
        JSON.stringify({ firstName, lastName, studentId, section }),
      );
      // ไปยังหน้าข้อสอบ
      router.push("/exam");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      setError("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-100 text-black">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">
          ระบบทำข้อสอบออนไลน์
        </h1>
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
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full py-2 px-4 bg-indigo-600 text-white font-semibold rounded-md shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            เริ่มทำข้อสอบ
          </button>
        </form>
      </div>
    </main>
  );
}
