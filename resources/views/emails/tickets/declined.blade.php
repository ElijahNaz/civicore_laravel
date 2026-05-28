<x-mail::message>
# Ticket Request Declined

Hello {{ $ticket->client_name }},

We regret to inform you that your request for a {{ ucfirst($ticket->purpose) }} Certificate has been declined.

**Ticket Number:** {{ $ticket->ticket_number }}

### Reason for Cancellation:
<x-mail::panel>
{{ $reason }}
</x-mail::panel>

If you believe this was an error, please ensure your details are correct and submit a new request.

Thanks,<br>
{{ config('app.name', 'CiviCORE Registry') }}
</x-mail::message>
