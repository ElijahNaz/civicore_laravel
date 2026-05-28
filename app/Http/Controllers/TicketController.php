<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Ticket;
use App\Mail\TicketConfirmation;
use App\Mail\TicketDeclinedMail;
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
        $expiry = Carbon::today(config('app.timezone'))->setTime(17, 0, 0);
        if (now(config('app.timezone'))->gt($expiry)) {
            $expiry->addDay();
        }
        return $expiry;
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
     * POST /api/v1/tickets  and  POST /api/public/tickets
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
                    'ticket_number'  => $ticketNumber,
                    'client_name'    => $request->client_name,
                    'email'          => $request->email,
                    'phone'          => $request->phone,
                    'purpose'        => $request->purpose,
                    'details'        => $request->details,
                    'token'          => $token,
                    'qr_code_token'  => $token,
                    'request_status' => 'pending',
                    'queue_status'   => 'not_in_lobby',
                    'source'         => 'online',
                    'expires_at'     => $expiry,
                    'qr_code_path'   => $qrPath,
                ]);

                // Send email if provided (non-blocking)
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
     * POST /api/v1/tickets/walk-in  and  POST /api/tickets/walk-in
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

                // Assign lobby sequence number starting at 101
                $todayCount = Ticket::whereDate('created_at', Carbon::today())
                    ->whereNotNull('queue_number')
                    ->count();
                $queueNumber = $todayCount + 101;

                $ticket = Ticket::create([
                    'ticket_number'  => $ticketNumber,
                    'client_name'    => $request->client_name,
                    'email'          => $request->email,
                    'phone'          => $request->phone,
                    'purpose'        => $request->purpose,
                    'details'        => $request->details ?? [],
                    'token'          => $token,
                    'qr_code_token'  => $token,
                    'request_status' => 'pending', // Pending record attachment but in lobby!
                    'queue_status'   => 'waiting',
                    'queue_number'   => $queueNumber,
                    'source'         => 'walk_in',
                    'expires_at'     => $expiry,
                    'qr_code_path'   => $qrPath,
                    'verified_at'    => Carbon::now(),
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
                    'qr_base64'   => $qrBase64,
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
     * GET /api/v1/tickets/{token}  and  GET /api/public/tickets/{token}
     */
    public function showByToken($token)
    {
        $ticket = Ticket::with('document')
            ->where('qr_code_token', $token)
            ->orWhere('token', $token)
            ->first();

        if (!$ticket) {
            return response()->json(['error' => 'Ticket not found.'], 404);
        }

        // Auto-expire: if past 5 PM and still pending, cancel
        if ($ticket->request_status === 'pending' && $ticket->isExpired()) {
            $ticket->request_status = 'cancelled';
            $ticket->queue_status = 'not_in_lobby';
            $ticket->save();
        }

        $queuePosition = 0;
        if ($ticket->queue_status === 'waiting') {
            $queuePosition = Ticket::where('queue_status', 'waiting')
                ->where('queue_number', '<', $ticket->queue_number)
                ->count() + 1;
        }

        $qrCodeUrl = $ticket->qr_code_path
            ? Storage::disk('public')->url($ticket->qr_code_path)
            : null;

        // Maintain compatibility mapping for status in UI
        $compatStatus = 'Pending';
        if ($ticket->request_status === 'completed') {
            $compatStatus = 'Completed';
        } elseif ($ticket->request_status === 'cancelled') {
            $compatStatus = 'Cancelled';
        } elseif ($ticket->queue_status === 'serving') {
            $compatStatus = 'Serving';
        }

        return response()->json([
            'ticket'         => array_merge($ticket->toArray(), ['status' => $compatStatus]),
            'queue_position' => $queuePosition,
            'qr_code_url'    => $qrCodeUrl,
            'is_expired'     => $ticket->request_status === 'cancelled' && $ticket->isExpired(),
        ]);
    }

    // ─── Staff: List Tickets ─────────────────────────────────────────────────

    /**
     * List tickets (Staff/Admin View with filters).
     * GET /api/v1/tickets  and  GET /api/tickets
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

        if ($request->has('request_status') && !empty($request->request_status) && $request->request_status !== 'all') {
            $query->where('request_status', $request->request_status);
        }

        if ($request->has('queue_status') && !empty($request->queue_status) && $request->queue_status !== 'all') {
            $query->where('queue_status', $request->queue_status);
        }

        // Support legacy 'status' filter if passed by older UI
        if ($request->has('status') && !empty($request->status) && $request->status !== 'all') {
            $status = strtolower($request->status);
            if ($status === 'pending') {
                $query->where('request_status', 'pending');
            } elseif ($status === 'serving') {
                $query->where('queue_status', 'serving');
            } elseif ($status === 'completed') {
                $query->where('request_status', 'completed');
            } elseif ($status === 'cancelled') {
                $query->where('request_status', 'cancelled');
            }
        }

        if ($request->has('source') && !empty($request->source) && $request->source !== 'all') {
            $query->where('source', $request->source);
        }

        $tickets = $query->orderByRaw("
            CASE
                WHEN queue_status = 'serving' THEN 1
                WHEN queue_status = 'waiting' THEN 2
                WHEN request_status = 'pending' THEN 3
                WHEN request_status = 'ready_for_pickup' THEN 4
                WHEN request_status = 'completed' THEN 5
                WHEN request_status = 'cancelled' THEN 6
                ELSE 7
            END
        ")->orderBy('created_at', 'asc')->get();

        // Attach QR URL and legacy compatibility 'status'
        $tickets->transform(function ($ticket) {
            $ticket->qr_code_url = $ticket->qr_code_path
                ? Storage::disk('public')->url($ticket->qr_code_path)
                : null;
            
            $compatStatus = 'Pending';
            if ($ticket->request_status === 'completed') {
                $compatStatus = 'Completed';
            } elseif ($ticket->request_status === 'cancelled') {
                $compatStatus = 'Cancelled';
            } elseif ($ticket->queue_status === 'serving') {
                $compatStatus = 'Serving';
            }
            $ticket->status = $compatStatus;

            return $ticket;
        });

        return response()->json($tickets);
    }

    /**
     * Digital Request Stats
     * GET /api/v1/tickets/digital-stats
     */
    public function digitalStats()
    {
        $today = date('Y-m-d');
        
        $pendingInbox = Ticket::where('request_status', 'pending')->count();
            
        $attachedToday = Ticket::where('request_status', 'document_attached')
            ->whereDate('updated_at', $today)
            ->count();
            
        $completedToday = Ticket::where('request_status', 'completed')
            ->whereDate('updated_at', $today)
            ->count();
            
        return response()->json([
            'pending_inbox' => $pendingInbox,
            'attached_today' => $attachedToday,
            'completed_today' => $completedToday,
        ]);
    }

    // ─── Staff: Update Status (Legacy compatibility) ─────────────────────────

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

        // Bridge state depending on selection
        switch (strtolower($request->status)) {
            case 'pending':
                $ticket->request_status = 'pending';
                $ticket->queue_status = 'waiting';
                break;
            case 'serving':
                $ticket->queue_status = 'serving';
                break;
            case 'completed':
                $ticket->request_status = 'completed';
                $ticket->queue_status = 'not_in_lobby';
                $ticket->issued_at = Carbon::now();
                break;
            case 'cancelled':
            case 'expired':
                $ticket->request_status = 'cancelled';
                $ticket->queue_status = 'not_in_lobby';
                break;
        }

        $ticket->save();

        return response()->json(['success' => true, 'ticket' => $ticket]);
    }

    // ─── Staff: Link Document (Legacy compatibility) ─────────────────────────

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
        $ticket->request_status = 'completed';
        $ticket->queue_status = 'not_in_lobby';
        $ticket->issued_at = Carbon::now();
        $ticket->save();

        $this->syncIssuanceWithTicket($ticket, $request->document_id);

        return response()->json(['success' => true, 'ticket' => $ticket]);
    }

    // ─── V1 Revamped Endpoints ──────────────────────────────────────────────

    /**
     * Staff accepts & links OCR record, marks request_status = 'ready_for_pickup'.
     * PATCH /api/v1/tickets/{id}/attach
     */
    public function attachDocument(Request $request, $id)
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
        $ticket->request_status = 'ready_for_pickup';
        $ticket->save();

        $this->syncIssuanceWithTicket($ticket, $request->document_id);

        return response()->json(['success' => true, 'ticket' => $ticket]);
    }

    /**
     * Staff declines/cancels a ticket.
     * PATCH /api/v1/tickets/{id}/cancel
     */
    public function cancelTicket(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'required|string',
            'send_email' => 'boolean'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $ticket = Ticket::find($id);

        if (!$ticket) {
            return response()->json(['error' => 'Ticket not found.'], 404);
        }

        $ticket->request_status = 'cancelled';
        
        // We can optionally store the cancellation reason in the details JSON
        $details = is_string($ticket->details) ? json_decode($ticket->details, true) : ($ticket->details ?: []);
        $details['cancellation_reason'] = $request->reason;
        $ticket->details = $details;
        
        $ticket->save();

        if ($request->send_email && $ticket->email) {
            try {
                Mail::to($ticket->email)->send(new TicketDeclinedMail($ticket, $request->reason));
            } catch (\Exception $e) {
                \Log::error("Failed to send cancellation email to {$ticket->email}: " . $e->getMessage());
                // Proceed despite email failure
            }
        }

        return response()->json(['success' => true, 'ticket' => $ticket]);
    }

    /**
     * Auto-generates or updates an Issuance in the Print Approval Queue
     * using the citizen's form input from the Ticket.
     */
    private function syncIssuanceWithTicket(Ticket $ticket, $documentId)
    {
        $document = DB::table('documents')->where('id', $documentId)->first();
        if (!$document) return;

        $docType = $document->detected_type ?: $document->type;
        if ($docType === 'marriage_license') {
            $docType = 'marriage';
        }
        if (empty($docType) || strtolower($docType) === 'unknown') {
            $docType = $ticket->purpose;
        }

        $normCertType = 'birth';
        if ($docType === 'death') {
            $normCertType = 'death';
        } elseif ($docType === 'marriage' || $docType === 'marriage_license') {
            $normCertType = 'marriage';
        }

        $details = is_string($ticket->details) ? json_decode($ticket->details, true) : ($ticket->details ?: []);
        $existingFields = json_decode($document->extracted_fields, true) ?: [];
        
        // Merge! The citizen's input takes precedence.
        $mergedFields = array_merge($existingFields, $details);
        $mergedData = json_encode($mergedFields, JSON_UNESCAPED_UNICODE);
        
        $personName = $ticket->client_name;

        $existing = DB::table('issuances')->where('document_id', $documentId)->first();

        if ($existing) {
            DB::table('issuances')
                ->where('id', $existing->id)
                ->update([
                    'ticket_number' => $ticket->ticket_number,
                    'extracted_data' => $mergedData,
                    'name' => $personName,
                    'status' => 'Pending Approval',
                    'updated_at' => Carbon::now()
                ]);
        } else {
            $prefix = ($docType === 'death') ? 'DC' : (($docType === 'marriage' || $docType === 'marriage_license') ? 'ML' : 'BC');
            $year = date('Y');
            
            $results = DB::select("SELECT MAX(id) as max_id FROM issuances");
            $nextNum = 1;
            if (count($results) > 0 && $results[0]->max_id !== null) {
                $nextNum = intval($results[0]->max_id) + 1;
            }
            
            $certNumber = $prefix . '-' . $year . '-' . str_pad($nextNum, 3, '0', STR_PAD_LEFT);
            $issuanceDate = date('m/d/Y');

            DB::table('issuances')->insert([
                'certNumber' => $certNumber,
                'type' => $docType,
                'certificate_type' => $normCertType,
                'name' => $personName,
                'barangay' => $document->barangay ?: 'N/A',
                'issuanceDate' => $issuanceDate,
                'status' => 'Pending Approval',
                'encoded_by' => 'System',
                'document_id' => $documentId,
                'extracted_data' => $mergedData,
                'ticket_number' => $ticket->ticket_number,
                'created_at' => Carbon::now(),
                'updated_at' => Carbon::now()
            ]);
        }
    }

    /**
     * Kiosk check-in (scans or enters QR token).
     * POST /api/v1/tickets/scan
     */
    public function scanCheckIn(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'qr_code_token' => 'required|string'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            return DB::transaction(function () use ($request) {
                $ticket = Ticket::where('qr_code_token', $request->qr_code_token)
                    ->orWhere('token', $request->qr_code_token)
                    ->first();

                if (!$ticket) {
                    return response()->json([
                        'success' => false,
                        'error'   => 'Invalid or unrecognized QR token.'
                    ], 404);
                }

                if ($ticket->request_status === 'completed') {
                    return response()->json([
                        'success' => false,
                        'error'   => 'This request has already been completed and issued.'
                    ], 422);
                }

                if ($ticket->request_status === 'cancelled') {
                    return response()->json([
                        'success' => false,
                        'error'   => 'This request has been cancelled or has expired.'
                    ], 422);
                }

                if (!in_array($ticket->request_status, ['pending', 'ready_for_pickup'])) {
                    return response()->json([
                        'success' => false,
                        'error'   => 'This ticket is not eligible for lobby check-in.',
                        'request_status' => $ticket->request_status
                    ], 422);
                }

                if ($ticket->queue_status === 'waiting' || $ticket->queue_status === 'serving') {
                    return response()->json([
                        'success' => true,
                        'message' => 'You are already checked into the lobby queue.',
                        'ticket'  => $ticket
                    ]);
                }

                // Allocate daily lobby queue number starting at 101
                $todayCount = Ticket::whereDate('verified_at', Carbon::today())
                    ->whereNotNull('queue_number')
                    ->count();
                $queueNumber = $todayCount + 101;

                $ticket->queue_status = 'waiting';
                $ticket->queue_number = $queueNumber;
                $ticket->verified_at  = Carbon::now();
                $ticket->save();

                return response()->json([
                    'success' => true,
                    'message' => 'Check-in successful! Proceed to waiting area.',
                    'ticket'  => $ticket
                ]);
            });
        } catch (\Exception $e) {
            \Log::error('Kiosk check-in error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error'   => 'Could not complete check-in.'
            ], 500);
        }
    }

    /**
     * Final admin counter issuance verification.
     * POST /api/v1/tickets/{id}/issue
     */
    public function issueDocument(Request $request, $id)
    {
        $ticket = Ticket::find($id);

        if (!$ticket) {
            return response()->json(['error' => 'Ticket not found.'], 404);
        }

        if ($ticket->request_status === 'completed') {
            return response()->json(['error' => 'Document has already been issued.'], 422);
        }

        $ticket->request_status = 'completed';
        $ticket->queue_status   = 'not_in_lobby';
        $ticket->issued_at      = Carbon::now();
        $ticket->save();

        return response()->json(['success' => true, 'ticket' => $ticket]);
    }
}
