// app/done/page.tsx

import Link from "next/link";

// 1. (สำคัญมาก) ต้องไม่มี "use client"; ที่บรรทัดบนสุด
//    เพราะเราจะใช้ props ที่ส่งมาจาก Server

// 2. นี่คือ Type ที่ถูกต้อง 100% ตามมาตรฐาน Next.js
//    มันบอกว่า searchParams เป็น object ที่:
//    - key เป็น string (รองรับ query param ทุกชื่อ)
//    - value เป็น string, หรือ array ของ string, หรือ undefined
type DonePageProps = {
  params: { [key: string]: string | string[] | undefined };
  searchParams: { [key: string]: string | string[] | undefined };
};

// 3. ใช้ DonePageProps นี้
export default function DonePage({ searchParams }: DonePageProps) {
  // 4. ดึงค่า status ออกมา
  //    เราต้องเช็คเผื่อว่ามันมาเป็น Array (เช่น ?status=timeout&status=other)
  const status = Array.isArray(searchParams.status)
    ? searchParams.status[0] // ถ้าเป็น Array, เอาแค่ตัวแรก
    : searchParams.status; // ถ้าไม่ใช่ (เป็น string หรือ undefined), ก็ใช้ได้เลย

  let message = "ส่งคำตอบเรียบร้อยแล้ว";
  if (status === "timeout") {
    message = "หมดเวลาทำข้อสอบ ระบบได้ส่งคำตอบของคุณแล้ว";
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-6 text-green-600">
          ดำเนินการเสร็จสิ้น
        </h1>

        <p className="text-lg mb-6 text-black">{message}</p>

        <Link
          href="/"
          className="py-2 px-4 bg-indigo-600 text-white font-semibold rounded-md shadow hover:bg-indigo-700"
        >
          กลับไปยังหน้าแรก
        </Link>
      </div>
    </main>
  );
}
