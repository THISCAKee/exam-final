// app/done/page.tsx

// 1. ลบ "use client"; ออก (ถ้ามี)
// 2. ลบ import { useSearchParams } ... ออก (ถ้ามี)

import Link from "next/link";

// 3. กำหนดประเภทของ props ที่จะรับ
type DonePageProps = {
  searchParams: {
    status?: string; // status อาจจะไม่มี, หรือเป็น string
  };
};

// 4. เปลี่ยนฟังก์ชันให้รับ props ที่ชื่อ searchParams
export default function DonePage({ searchParams }: DonePageProps) {
  // 5. ดึงค่า status ออกมาจาก props ได้เลย
  const status = searchParams.status;

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

        {/* 6. แสดง message ได้ตามปกติ */}
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
