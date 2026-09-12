"use client";
import type { Collaborator } from "@/app/lib/collaboration/notes-session";

export function NotesCollaborators({ peers }: { peers: Collaborator[] }) {
  const people = [...new Map(peers.map(peer => [peer.actorId, { ...peer, typing: peers.some(p => p.actorId === peer.actorId && p.typing) }])).values()];
  if (!people.length) return null;
  return <details className="notes-people">
    <summary aria-label={`${people.length} other ${people.length === 1 ? "person" : "people"} in these notes`}>
      {people.slice(0, 3).map(person => <span key={person.actorId} className="notes-avatar" style={{ borderColor: person.color }} title={person.name}>
        {person.name.split(/\s+/).slice(0, 2).map(s => s[0]).join("")}
      </span>)}
      {people.length > 3 && <span className="notes-avatar">+{people.length - 3}</span>}
    </summary>
    <ul>{people.map(person => <li key={person.actorId}><span style={{ color: person.color }}>{person.name}</span><small>{person.typing ? "Typing" : "Editing"}{peers.filter(p => p.actorId === person.actorId).length > 1 ? " · multiple tabs" : ""}</small></li>)}</ul>
  </details>;
}

export function NotesTyping({ peers }: { peers: Collaborator[] }) {
  const names = [...new Map(peers.filter(p => p.typing).map(p => [p.actorId, p.name.split(" ")[0]])).values()];
  return <span className="notes-typing">{names.length === 1 ? `${names[0]} is typing…` : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : names.length > 2 ? `${names.length} people are typing…` : ""}</span>;
}
