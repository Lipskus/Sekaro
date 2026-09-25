export function campaignView(c) {
  const stats = c.stats || {};
  const totalLeads = stats.total_leads || 0;
  const emailsSent = stats.emails_sent || 0;
  const scheduled = stats.scheduled || 0;
  const replies = stats.replies || 0;
  const bounced = stats.bounced || 0;
  const unsubscribed = stats.unsubscribed || 0;
  const needsCustom = stats.needs_custom_email || 0;
  const denom = emailsSent + scheduled;
  const percent = denom > 0 ? Math.round((emailsSent / denom) * 100) : 0;
  const replyRate = emailsSent > 0 ? Math.round((replies / emailsSent) * 100) : 0;
  const isPaused = !!c.paused;
  const isCompleted = !isPaused && scheduled === 0 && emailsSent > 0;
  // Progress uses messages in both states: one contact may receive several steps.

  let statusKey = 'active';
  let statusLabel = 'Aktywna';
  let tone = 'green';
  if (isPaused) {
    statusKey = 'paused'; statusLabel = 'Wstrzymana'; tone = 'amber';
  } else if (needsCustom > 0) {
    statusKey = 'issues'; statusLabel = 'Wymaga poprawek'; tone = 'red';
  } else if (isCompleted) {
    statusKey = 'completed'; statusLabel = 'Zakończona'; tone = 'blue';
  } else if (totalLeads === 0) {
    statusKey = 'draft'; statusLabel = 'Szkic'; tone = 'neutral';
  }

  return {
    totalLeads, emailsSent, scheduled, replies, bounced, unsubscribed, needsCustom,
    percent, replyRate, isPaused, isCompleted, statusKey, statusLabel, tone,
  };
}
