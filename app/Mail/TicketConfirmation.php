<?php

namespace App\Mail;

use App\Models\Ticket;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TicketConfirmation extends Mailable
{
    use Queueable, SerializesModels;

    public Ticket $ticket;
    public string $ticketUrl;
    public string $qrCodeBase64;

    public function __construct(Ticket $ticket, string $qrCodeBase64)
    {
        $this->ticket       = $ticket;
        $this->qrCodeBase64 = $qrCodeBase64;
        $this->ticketUrl    = url('/ticket/' . $ticket->token);
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: '[CiviCORE] Your Queue Ticket – ' . $this->ticket->ticket_number,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.ticket_confirmation',
        );
    }
}
