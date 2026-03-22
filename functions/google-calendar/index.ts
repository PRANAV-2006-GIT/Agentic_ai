import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalendarEvent {
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, eventData, calendarId } = await req.json();
    const apiKey = Deno.env.get('GOOGLE_CALENDAR_API_KEY');

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Google Calendar API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result;

    switch (action) {
      case 'create': {
        const calendarEvent: CalendarEvent = {
          summary: eventData.title,
          description: eventData.description || '',
          start: {
            dateTime: eventData.start_time,
            timeZone: 'UTC',
          },
          end: {
            dateTime: eventData.end_time,
            timeZone: 'UTC',
          },
          location: eventData.location || '',
        };

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('GOOGLE_CLIENT_SECRET')}`,
            },
            body: JSON.stringify(calendarEvent),
          }
        );

        if (!response.ok) {
          throw new Error(`Google Calendar API error: ${response.statusText}`);
        }

        result = await response.json();
        break;
      }

      case 'update': {
        if (!calendarId) {
          throw new Error('Calendar ID required for update');
        }

        const calendarEvent: CalendarEvent = {
          summary: eventData.title,
          description: eventData.description || '',
          start: {
            dateTime: eventData.start_time,
            timeZone: 'UTC',
          },
          end: {
            dateTime: eventData.end_time,
            timeZone: 'UTC',
          },
          location: eventData.location || '',
        };

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarId}?key=${apiKey}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('GOOGLE_CLIENT_SECRET')}`,
            },
            body: JSON.stringify(calendarEvent),
          }
        );

        if (!response.ok) {
          throw new Error(`Google Calendar API error: ${response.statusText}`);
        }

        result = await response.json();
        break;
      }

      case 'delete': {
        if (!calendarId) {
          throw new Error('Calendar ID required for delete');
        }

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarId}?key=${apiKey}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${Deno.env.get('GOOGLE_CLIENT_SECRET')}`,
            },
          }
        );

        if (!response.ok && response.status !== 204) {
          throw new Error(`Google Calendar API error: ${response.statusText}`);
        }

        result = { success: true };
        break;
      }

      case 'list': {
        const { timeMin, timeMax } = eventData || {};
        let url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?key=${apiKey}`;
        
        if (timeMin) url += `&timeMin=${timeMin}`;
        if (timeMax) url += `&timeMax=${timeMax}`;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${Deno.env.get('GOOGLE_CLIENT_SECRET')}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Google Calendar API error: ${response.statusText}`);
        }

        result = await response.json();
        break;
      }

      default:
        throw new Error('Invalid action');
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
