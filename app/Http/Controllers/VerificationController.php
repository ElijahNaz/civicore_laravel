<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use App\Mail\VerificationCodeMail;
use App\Models\VerificationCode;
use Carbon\Carbon;

class VerificationController extends Controller
{
    /**
     * POST /api/verification/send
     * Generate a 6-digit code and email it to the provided address.
     */
    public function send(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $email = $request->input('email');

        // Invalidate any previous unused codes for this email
        VerificationCode::where('email', $email)->where('used', false)->delete();

        // Generate 6-digit numeric code
        $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        // Store it with 10-minute expiry
        VerificationCode::create([
            'email'      => $email,
            'code'       => $code,
            'expires_at' => Carbon::now()->addMinutes(10),
            'used'       => false,
        ]);

        // Send the email
        try {
            Mail::to($email)->send(new VerificationCodeMail($email, $code));
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error'   => 'Failed to send email: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'success' => true,
            'message' => "Verification code sent to {$email}.",
        ]);
    }

    /**
     * POST /api/verification/verify
     * Check if the submitted code matches and is still valid.
     */
    public function verify(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'code'  => 'required|string|size:6',
        ]);

        $email = $request->input('email');
        $code  = $request->input('code');

        $record = VerificationCode::where('email', $email)
            ->where('code', $code)
            ->where('used', false)
            ->where('expires_at', '>=', Carbon::now())
            ->latest()
            ->first();

        if (!$record) {
            return response()->json([
                'success' => false,
                'error'   => 'Invalid or expired verification code.',
            ], 422);
        }

        // Mark as used so it cannot be reused
        $record->update(['used' => true]);

        return response()->json([
            'success' => true,
            'message' => 'Email verified successfully.',
        ]);
    }
}
