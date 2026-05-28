<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Ticket;
use App\Mail\TicketConfirmation;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use SimpleSoftwareIO\QrCode\Facades\QrCode;
use Carbon\Carbon;

class TicketController extends Controller
{
    // ─── Helpers ────────────────────────────────────────────────────────────

    /**
     * Build the 5 PM expiry timestamp for the current day.
     */
    private function buildExpiry(): Carbon
    {
        return Carbon::today(config('app.timezone'))->setTime(17, 0, 0);
    }

    /**
     * Generate a QR code PNG, persist it, and return the base64 string.
     * Returns [qr_code_path (relative), base64_string].
     */
    private function generateQr(string $token): array
    {
        $url      = url('/ticket/' . $token);
        $filename = 'qrcodes/ticket_' . $token . '.svg';

        // Generate as SVG binary (300px, no margin)
        $svg = QrCode::format('svg')
            ->size(300)
            ->margin(1)
            ->errorCorrection('M')
            ->generate($url);

        Storage::disk('public')->put($filename, $svg);

        return [$filename, base64_encode($svg)];
    }

    // ─── Public: Online Ticket Submission ───────────────────────────────────

    /**
     * Store a newly created ticket (Public Client Submission).
     * POST /api/public/tickets
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'client_name' => 'required|string|max:255',
            'email'       => 'nullable|email|max:255',
            'phone'       => 'nullable|string|max:50',
            'purpose'     => 'required|in:birth,death,marriage',
            'details'     => 'required|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            return DB::transaction(function () use ($request) {
                $year  = date('Y');
                $count = DB::table('tickets')
                    ->whereYear('created_at', $year)
                    ->lockForUpdate()
                    ->count();

                $seq          = $count + 1;
                $ticketNumber = 'T-' . $year . '-' . str_pad($seq, 4, '0', STR_PAD_LEFT);
                $token        = Str::random(40);
                $expiry       = $this->buildExpiry();

                // Generate QR code
                [$qrPath, $qrBase64] = $this->generateQr($token);

                $ticket = Ticket::create([
                    'ticket_number' => $ticketNumber,
                    'client_name'   => $request->client_name,
                    'email'         => $request->email,
                    'phone'         => $request->phone,
                    'purpose'       => $request->purpose,
                    'details'       => $request->details,
                    'token'         => $token,
                    'status'        => 'Pending',
                    'source'        => 'online',
                    'expires_at'    => $expiry,
                    'qr_code_path'  => $qrPath,
                ]);

                // Send email if provided (non-blocking — catches mail errors)
                if ($request->email) {
                    try {
                        Mail::to($request->email)
                            ->send(new TicketConfirmation($ticket, $qrBase64));
                    } catch (\Exception $mailErr) {
                        \Log::warning('Ticket email failed: ' . $mailErr->getMessage());
                    }
                }

                return response()->json([
                    'success'       => true,
                    'ticket'        => $ticket,
                    'qr_code_url'   => Storage::disk('public')->url($qrPath),
                    'ticket_url'    => url('/ticket/' . $token),
                    'email_sent'    => (bool) $request->email,
                ], 201);
            });
        } catch (\Exception $e) {
            \Log::error('Ticket creation error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error'   => 'Could not generate ticket. Please try again.',
            ], 500);
        }
    }

    // ─── Staff: Walk-In Ticket ───────────────────────────────────────────────

    /**
     * Issue a walk-in ticket on behalf of a client who arrives without pre-booking.
     * POST /api/tickets/walk-in  (auth required)
     */
    public function storeWalkIn(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'client_name' => 'required|string|max:255',
            'email'       => 'nullable|email|max:255',
            'purpose'     => 'required|in:birth,death,marriage',
            'phone'       => 'nullable|string|max:50',
            'details'     => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            return DB::transaction(function () use ($request) {
                $year  = date('Y');
                $count = DB::table('tickets')
                    ->where('source', 'walk_in')
                    ->whereYear('created_at', $year)
                    ->lockForUpdate()
                    ->count();

                $seq          = $count + 1;
                $ticketNumber = 'WI-' . $year . '-' . str_pad($seq, 4, '0', STR_PAD_LEFT);
                $token        = Str::random(40);
                $expiry       = $this->buildExpiry();

                [$qrPath, $qrBase64] = $this->generateQr($token);

                $ticket = Ticket::create([
                    'ticket_number' => $ticketNumber,
                    'client_name'   => $request->client_name,
                    'email'         => $request->email,
                    'phone'         => $request->phone,
                    'purpose'       => $request->purpose,
                    'details'       => $request->details ?? [],
                    'token'         => $token,
                    'status'        => 'Pending',
                    'source'        => 'walk_in',
                    'expires_at'    => $expiry,
                    'qr_code_path'  => $qrPath,
                ]);

                // Send email if provided (non-blocking)
                if ($request->email) {
                    try {
                        Mail::to($request->email)
                            ->send(new TicketConfirmation($ticket, $qrBase64));
                    } catch (\Exception $mailErr) {
                        \Log::warning('Walk-in ticket email failed: ' . $mailErr->getMessage());
                    }
                }

                return response()->json([
                    'success'     => true,
                    'ticket'      => $ticket,
                    'qr_code_url' => Storage::disk('public')->url($qrPath),
                    'qr_base64'   => $qrBase64, // returned so UI can display it inline
                    'ticket_url'  => url('/ticket/' . $token),
                    'email_sent'  => (bool) $request->email,
                ], 201);
            });
        } catch (\Exception $e) {
            \Log::error('Walk-in ticket creation error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error'   => 'Could not generate walk-in ticket.',
            ], 500);
        }
    }

    // ─── Public: Ticket Status ───────────────────────────────────────────────

    /**
     * Retrieve ticket status & details (Public Status Check).
     * GET /api/public/tickets/{token}
     */
    public function showByToken($token)
    {
        $ticket = Ticket::with('document')->where('token', $token)->first();

        if (!$ticket) {
            return response()->json(['error' => 'Ticket not found.'], 404);
        }

        // Auto-expire: if past 5 PM and still Pending, flip to Expired
        if ($ticket->status === 'Pending' && $ticket->isExpired()) {
            $ticket->status = 'Expired';
            $ticket->save();
        }

        $queuePosition = 0;
        if ($ticket->status === 'Pending') {
            $queuePosition = Ticket::where('status', 'Pending')
                ->where('id', '<', $ticket->id)
                ->count() + 1;
        }

        $qrCodeUrl = $ticket->qr_code_path
            ? Storage::disk('public')->url($ticket->qr_code_path)
            : null;

        return response()->json([
            'ticket'         => $ticket,
            'queue_position' => $queuePosition,
            'qr_code_url'    => $qrCodeUrl,
            'is_expired'     => $ticket->status === 'Expired',
        ]);
    }

    // ─── Staff: List Tickets ─────────────────────────────────────────────────

    /**
     * List tickets (Staff/Admin View with filters).
     * GET /api/tickets
     */
    public function index(Request $request)
    {
        $query = Ticket::query()->with('document');

        if ($request->has('search') && !empty($request->search)) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('ticket_number', 'LIKE', "%{$search}%")
                  ->orWhere('client_name', 'LIKE', "%{$search}%");
            });
        }

        if ($request->has('purpose') && !empty($request->purpose) && $request->purpose !== 'all') {
            $query->where('purpose', $request->purpose);
        }

        if ($request->has('status') && !empty($request->status) && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        if ($request->has('source') && !empty($request->source) && $request->source !== 'all') {
            $query->where('source', $request->source);
        }

        $tickets = $query->orderByRaw("
            CASE
                WHEN status = 'Serving'   THEN 1
                WHEN status = 'Pending'   THEN 2
                WHEN status = 'Completed' THEN 3
                WHEN status = 'Cancelled' THEN 4
                WHEN status = 'Expired'   THEN 5
                ELSE 6
            END
        ")->orderBy('created_at', 'asc')->get();

        // Attach QR URL to each ticket
        $tickets->transform(function ($ticket) {
            $ticket->qr_code_url = $ticket->qr_code_path
                ? Storage::disk('public')->url($ticket->qr_code_path)
                : null;
            return $ticket;
        });

        return response()->json($tickets);
    }

    // ─── Staff: Update Status ────────────────────────────────────────────────

    public function updateStatus(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'status' => 'required|in:Pending,Serving,Completed,Cancelled,Expired'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $ticket = Ticket::find($id);

        if (!$ticket) {
            return response()->json(['error' => 'Ticket not found.'], 404);
        }

        $ticket->status = $request->status;
        $ticket->save();

        return response()->json(['success' => true, 'ticket' => $ticket]);
    }

    // ─── Staff: Link Document ────────────────────────────────────────────────

    public function linkDocument(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'document_id' => 'required|exists:documents,id'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $ticket = Ticket::find($id);

        if (!$ticket) {
            return response()->json(['error' => 'Ticket not found.'], 404);
        }

        $ticket->document_id = $request->document_id;
        if ($ticket->status === 'Serving' || $ticket->status === 'Pending') {
            $ticket->status = 'Completed';
        }
        $ticket->save();

        // Link ticket number to issuance if document is already approved
        DB::table('issuances')
            ->where('document_id', $request->document_id)
            ->update(['ticket_number' => $ticket->ticket_number]);

        return response()->json(['success' => true, 'ticket' => $ticket]);
    }
}
