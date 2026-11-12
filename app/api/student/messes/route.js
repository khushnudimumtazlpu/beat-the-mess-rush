import "server-only";

import { AuthorizationError } from "../../../../lib/auth-authorization.js";
import { listActiveStudentMesses, StudentDemandError } from "../../../../lib/student-demands.js";

export const runtime = "nodejs";

function apiError(message, code, status) {
  return Response.json({ success: false, error: { code, message } }, { status });
}

export async function GET() {
  try {
    const messes = await listActiveStudentMesses();
    return Response.json({
      success: true,
      data: { messes },
      message: "Active Messes retrieved successfully.",
    });
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof StudentDemandError) {
      return apiError(error.message, error.code, error.status);
    }
    console.error("Student active Mess list API error:", error);
    return apiError("An unexpected server error occurred.", "INTERNAL_SERVER_ERROR", 500);
  }
}
