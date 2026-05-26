<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Ticket;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;

class TicketController extends Controller
{
    /**
     * Store a newly created ticket (Public Client Submission).
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
                $year = date('Y');
                
                // Get count for sequential number generation
                $count = DB::table('tickets')
                    ->whereYear('created_at', $year)
                    ->lockForUpdate()
                    ->count();
                
                $seq = $count + 1;
                $ticketNumber = 'T-' . $year . '-' . str_pad($seq, 4, '0', STR_PAD_LEFT);
                $token = Str::random(40);

                $ticket = Ticket::create([
                    'ticket_number' => $ticketNumber,
                    'client_name'   => $request->client_name,
                    'email'         => $request->email,
                    'phone'         => $request->phone,
                    'purpose'       => $request->purpose,
                    'details'       => $request->details,
                    'token'         => $token,
                    'status'        => 'Pending',
                ]);

                return response()->json([
                    'success' => true,
                    'ticket'  => $ticket
                ], 201);
            });
        } catch (\Exception $e) {
            \Log::error('Ticket creation error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error'   => 'Could not generate ticket. Please try again.'
            ], 500);
        }
    }

    /**
     * Retrieve ticket status & details (Public Status Check).
     */
    public function showByToken($token)
    {
        $ticket = Ticket::with('document')->where('token', $token)->first();

        if (!$ticket) {
            return response()->json(['error' => 'Ticket not found.'], 404);
        }

        // Get queue position if pending
        $queuePosition = 0;
        if ($ticket->status === 'Pending') {
            $queuePosition = Ticket::where('status', 'Pending')
                ->where('id', '<', $ticket->id)
                ->count() + 1;
        }

        return response()->json([
            'ticket'         => $ticket,
            'queue_position' => $queuePosition
        ]);
    }

    /**
     * List tickets (Staff/Admin View with filters).
     */
    public function index(Request $request)
    {
        $query = Ticket::query()->with('document');

        // Filter by search term (ticket number or client name)
        if ($request->has('search') && !empty($request->search)) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('ticket_number', 'LIKE', "%{$search}%")
                  ->orWhere('client_name', 'LIKE', "%{$search}%");
            });
        }

        // Filter by purpose
        if ($request->has('purpose') && !empty($request->purpose) && $request->purpose !== 'all') {
            $query->where('purpose', $request->purpose);
        }

        // Filter by status
        if ($request->has('status') && !empty($request->status) && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        // Order by status priority (Serving, Pending, then Completed/Cancelled)
        $tickets = $query->orderByRaw("
            CASE 
                WHEN status = 'Serving' THEN 1
                WHEN status = 'Pending' THEN 2
                WHEN status = 'Completed' THEN 3
                WHEN status = 'Cancelled' THEN 4
                ELSE 5
            END
        ")->orderBy('created_at', 'asc')->get();

        return response()->json($tickets);
    }

    /**
     * Update ticket status (Staff Queue Control).
     */
    public function updateStatus(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'status' => 'required|in:Pending,Serving,Completed,Cancelled'
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

        return response()->json([
            'success' => true,
            'ticket'  => $ticket
        ]);
    }

    /**
     * Link ticket to a generated issuance/document.
     */
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
        if ($ticket->status === 'Serving') {
            $ticket->status = 'Completed';
        }
        $ticket->save();

        return response()->json([
            'success' => true,
            'ticket'  => $ticket
        ]);
    }
}
