"use client";

import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import type { Person, Plan } from "@/lib/types";

export function PlanTextActions({
  plan,
  people,
  me,
}: {
  plan: Plan;
  people: Person[];
  me: Person;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const [showNumbers, setShowNumbers] = useState(false);
  const ownPhone = me.phone.replace(/[^+\d]/g, "");
  const numbers = [
    ...new Set(
      people
        .filter(
          (person) =>
            person.id !== me.id && plan.participants.includes(person.id),
        )
        .map((person) => person.phone.replace(/[^+\d]/g, ""))
        .filter((phone) => phone && phone !== ownPhone),
    ),
  ];
  const recipients = numbers.join(",");

  if (!numbers.length) {
    return <p className="field-note">No other participants to text yet.</p>;
  }

  return (
    <div className="plan-text-actions">
      <div className="detail-action-row">
        <a
          className="button secondary"
          href={`sms:${recipients}`}
          onClick={(event) => {
            const isAppleMobile =
              /iPhone|iPad|iPod/.test(navigator.userAgent) ||
              (navigator.platform === "MacIntel" &&
                navigator.maxTouchPoints > 1);
            if (isAppleMobile) {
              event.preventDefault();
              window.location.href = `sms:/open?addresses=${recipients}`;
            }
          }}
        >
          <MessageCircle size={16} /> Text everyone
        </a>
        <button
          className="button secondary"
          onClick={async () => {
            setShowNumbers(true);
            try {
              await navigator.clipboard.writeText(numbers.join(", "));
              setCopyStatus(
                "Numbers copied. Paste them into the To field in Messages.",
              );
            } catch {
              setCopyStatus(
                "Select and copy the numbers below, then paste them into the To field in Messages.",
              );
            }
          }}
        >
          <Copy size={16} /> Copy numbers
        </button>
      </div>
      <p className="field-note">
        Opens a message to the other current participants. If the recipients
        don&apos;t appear, copy their numbers instead. Numbers are samples.
      </p>
      <p className="field-note" role="status">
        {copyStatus}
      </p>
      {showNumbers && (
        <label className="recipient-numbers">
          Participant numbers
          <input
            readOnly
            value={numbers.join(", ")}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </div>
  );
}
