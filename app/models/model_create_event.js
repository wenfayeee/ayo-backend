const client = require("../db");
const nodemailer = require('nodemailer');
const CustomError = require('../middleware/CustomError');

async function getEvent() {
  try {
    const query = "SELECT * FROM ayo_drc_schema.tablecreateevent";
    const results = await client.query(query);
    return { success: true, data: results.rows };
  } catch (e) {
    console.error(e);
    throw new CustomError(500, "Failed to get events");
  }
}

async function getEventByEmail(eventId) {
  try {
    const query =
      "SELECT * FROM ayo_drc_schema.tablecreateevent WHERE email = $1";
    const resp = await client.query(query, [eventId]);
    return { success: true, data: resp.rows };
  } catch (e) {
    console.error(e);
    throw new CustomError(500, "Failed to get events");
  }
}

async function getEventByinviteeEmail(inviteeEmail) {
  try {
    const query =
      "SELECT * FROM ayo_drc_schema.tablecreateevent JOIN ayo_drc_schema.tableinviteeemail ON tablecreateevent.event_code = tableinviteeemail.event_code WHERE tableinviteeemail.invitee_email = $1";
    const resp = await client.query(query, [inviteeEmail]);
    return { success: true, data: resp.rows };
  } catch (e) {
    console.error(e);
    throw new CustomError(500, "Failed to get events");
  }
}

async function getEventByEventCode(eventCode) {
  try {
    const query =
      "SELECT * FROM ayo_drc_schema.tablecreateevent WHERE event_code = $1";
    const resp = await client.query(query, [eventCode]);
    return { success: true, data: resp.rows };
  } catch (e) {
    console.error(e);
    throw new CustomError(500, "Failed to get events");
  }
}

async function addEvent({
  event_name,
  event_date,
  event_time,
  event_address,
  event_detail,
  event_rsvp_before_date,
  event_rsvp_before_time,
  event_code,
  invitee_email,
  email,
}) {
  const eventDateTime = new Date(`${event_date}T${event_time}`);
  const rsvpDeadlineDateTime = new Date(`${event_rsvp_before_date}T${event_rsvp_before_time}`);

  if (rsvpDeadlineDateTime > eventDateTime) {
    return { success: false, message: "RSVP deadline cannot be later than event date and time" };
  }

  try {
    await client.query("BEGIN");

    const checkEventCodeQuery =
      "SELECT event_code FROM ayo_drc_schema.tablecreateevent WHERE event_code = $1";
    const checkEventCodeResult = await client.query(checkEventCodeQuery, [event_code]);

    if (checkEventCodeResult.rowCount > 0) {
      throw new CustomError(400, 'Event with the same event_code already exists');
    }
    

    const insertEventQuery =
      "INSERT INTO ayo_drc_schema.tablecreateevent (event_name, event_date, event_time, event_address, event_detail, event_rsvp_before_date, event_rsvp_before_time, event_code, email) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING event_code";
    const eventValues = [
      event_name,
      event_date,
      event_time,
      event_address,
      event_detail,
      event_rsvp_before_date,
      event_rsvp_before_time,
      event_code,
      email,
    ];
    const eventResult = await client.query(insertEventQuery, eventValues);

    const eventCode = eventResult.rows[0].event_code;

    if (invitee_email && invitee_email.length > 0) {
      const insertinviteeEmailQuery =
        "INSERT INTO ayo_drc_schema.tableinviteeemail (event_code, invitee_email) VALUES ($1, $2)";
      const inviteeEmailValues = invitee_email.map((email) => [eventCode, email]);
      await Promise.all(
        inviteeEmailValues.map((values) =>
          client.query(insertinviteeEmailQuery, values)
        )
      );

      const transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: {
          user: "ayoevents12@gmail.com",
          pass: "zvtnlzqbugvqhumj",
        },
      });

      const mailOptions = {
        from: 'ayoevents12@gmail.com',
        subject: 'You have been invited to an event',
        html: `<p>You have been invited to the event ${event_name}. Click <a href="http://your-app.com/events/${eventCode}">here</a> to view the event.</p>`
      };

      const sendInvitationEmails = invitee_email.map((email) => {
        mailOptions.to = email;
        return transporter.sendMail(mailOptions);
      });

      await Promise.all(sendInvitationEmails);
    }

    await client.query("COMMIT");

    return { success: true, data: eventResult.rows };
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    throw new CustomError(500, 'Failed to add event');
  }
}

async function deleteEvent(eventCode) {
  try {
    await client.query('BEGIN');

    const deleteRsvpQuery =
      'DELETE FROM ayo_drc_schema.tablersvp WHERE event_code = $1';
    await client.query(deleteRsvpQuery, [eventCode]);

    const deleteInviteeEmailQuery =
      'DELETE FROM ayo_drc_schema.tableinviteeemail WHERE event_code = $1';
    const deleteInviteeEmailResult = await client.query(
      deleteInviteeEmailQuery,
      [eventCode]
    );

    const deleteEventQuery =
      'DELETE FROM ayo_drc_schema.tablecreateevent WHERE event_code = $1';
    const deleteEventResult = await client.query(deleteEventQuery, [eventCode]);

    await client.query('COMMIT');

    if (
      deleteInviteeEmailResult.rowCount === 0 &&
      deleteEventResult.rowCount === 0
    ) {
      throw new CustomError(404, "Event not found");
    }

    return { success: true, data: deleteEventResult.rows };
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    throw new CustomError(500, "Failed to delete event");
  } finally {
    await client.query('END');
  }
}

async function updateEvent(eventCode, eventData) {
  try {
    const {
      event_name,
      event_date,
      event_time,
      event_address,
      event_detail,
      event_rsvp_before_date,
      event_rsvp_before_time,
    } = eventData;

    await client.query('BEGIN');

    const updateEventQuery =
      'UPDATE ayo_drc_schema.tablecreateevent SET event_name = $1, event_date = $2, event_time = $3, event_address = $4, event_detail = $5, event_rsvp_before_date = $6, event_rsvp_before_time = $7 WHERE event_code = $8';
    const eventValues = [
      event_name,
      event_date,
      event_time,
      event_address,
      event_detail,
      event_rsvp_before_date,
      event_rsvp_before_time,
      eventCode,
    ];
    await client.query(updateEventQuery, eventValues);

    if (eventData.invitee_email && eventData.invitee_email.length > 0) {
      const insertInviteeEmailQuery =
        'INSERT INTO ayo_drc_schema.tableinviteeemail (event_code, invitee_email) VALUES ($1, $2)';
      const inviteeEmailValues = eventData.invitee_email.map((email) => [
        eventCode,
        email,
      ]);
      await Promise.all(
        inviteeEmailValues.map((values) =>
          client.query(insertInviteeEmailQuery, values)
        )
      );
    }

    await client.query('COMMIT');

    return { success: true, data: inviteeEmailValues };
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    throw new CustomError(500, "Failed to update event");
  }
}

module.exports = {
  getEvent,
  getEventByEmail,
  getEventByinviteeEmail,
  getEventByEventCode,
  addEvent,
  deleteEvent,
  updateEvent
};
