import { NextRequest } from 'next/server';
import { attemptAction } from '@/server/attempt-api';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(req: NextRequest) { return attemptAction(req, 'claim'); }
