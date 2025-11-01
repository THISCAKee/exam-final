// app/api/submit/route.ts

import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { allQuestions } from "@/app/lib/questions";

const answerKeyMap = new Map<number, string>();
allQuestions.forEach((q) => {
  answerKeyMap.set(q.id, q.answerKey);
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // +++ รับข้อมูลชุดใหม่จาก body +++
    const {
      firstName,
      lastName,
      studentId,
      section,
      userAnswers, // นี่คือ Array คำตอบ ['ก', 'ข', ...]
      questionOrder, // นี่คือ Array ID [15, 3, 42, ...]
    } = body;

    // ตรวจสอบข้อมูลเบื้องต้น
    if (
      !firstName ||
      !studentId ||
      !userAnswers ||
      !questionOrder ||
      userAnswers.length !== questionOrder.length
    ) {
      return NextResponse.json(
        { error: "Missing or mismatched required fields" },
        { status: 400 },
      );
    }

    // +++ ส่วนคำนวณคะแนน +++
    let score = 0;
    for (let i = 0; i < questionOrder.length; i++) {
      const qId = questionOrder[i]; // ID ของคำถามข้อที่ i
      const userAnswer = userAnswers[i]; // คำตอบของผู้ใช้ข้อที่ i
      const correctAnswer = answerKeyMap.get(qId); // ดึงเฉลยของ ID นี้

      if (userAnswer === correctAnswer) {
        score++; // ถ้าตรงกัน ก็บวก 1 คะแนน
      }
    }
    // +++++++++++++++++++++++++

    // เตรียมข้อมูลสำหรับ Google Sheets
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      : "";

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const sheetId = process.env.GOOGLE_SHEET_ID;

    if (!sheetId) {
      throw new Error("Google Sheet ID is not defined");
    }

    // สร้างแถวข้อมูลที่จะเพิ่ม (เพิ่ม 'score' เข้าไป)
    const newRow = [
      new Date().toISOString(), // Timestamp
      firstName,
      lastName,
      studentId,
      section,
      score, // <--- เพิ่มคะแนนที่คำนวณได้ตรงนี้
      ...userAnswers, // เพิ่มคำตอบ 60 ข้อต่อกันไป (ก, ข, ค...)
    ];

    // เขียนข้อมูลลงใน Sheet
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Sheet1!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newRow],
      },
    });

    return NextResponse.json(
      { success: true, data: response.data },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error submitting to Google Sheets:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Unknown error occurred" },
      { status: 500 },
    );
  }
}
