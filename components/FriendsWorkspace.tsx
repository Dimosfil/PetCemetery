"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type FriendPerson = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  city: string;
  friendshipId: string | null;
  friendshipStatus: "pending" | "accepted" | null;
  requesterId: string | null;
};

type FriendshipAction = "accept" | "decline" | "cancel" | "remove";

function PersonAvatar({ person }: { person: FriendPerson }) {
  if (person.avatarUrl) {
    return <img className="friend-avatar" src={person.avatarUrl} alt="" />;
  }
  return <span className="friend-avatar friend-avatar-placeholder" aria-hidden="true">{person.displayName.slice(0, 1).toUpperCase()}</span>;
}

export function FriendsWorkspace({
  currentUserId,
  currentUserCity,
  searchCity,
  searchAttempted,
  searchValid,
  searchResults,
  incomingRequests,
  friends,
}: {
  currentUserId: string;
  currentUserCity: string;
  searchCity: string;
  searchAttempted: boolean;
  searchValid: boolean;
  searchResults: FriendPerson[];
  incomingRequests: FriendPerson[];
  friends: FriendPerson[];
}) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState("");
  const [error, setError] = useState("");

  async function sendRequest(personId: string) {
    await mutate(`send:${personId}`, "/api/friends", "POST", { userId: personId });
  }

  async function updateFriendship(friendshipId: string, action: FriendshipAction) {
    await mutate(`${action}:${friendshipId}`, `/api/friends/${friendshipId}`, "PATCH", { action });
  }

  async function mutate(key: string, url: string, method: "POST" | "PATCH", body: object) {
    setPendingKey(key);
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Не удалось выполнить действие");
        return;
      }
      router.refresh();
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setPendingKey("");
    }
  }

  function actions(person: FriendPerson) {
    if (!person.friendshipId) {
      return <button className="button button-small" disabled={Boolean(pendingKey)} onClick={() => sendRequest(person.id)}>Добавить в друзья</button>;
    }
    if (person.friendshipStatus === "accepted") {
      return <button className="button button-small button-ghost" disabled={Boolean(pendingKey)} onClick={() => updateFriendship(person.friendshipId!, "remove")}>Удалить из друзей</button>;
    }
    if (person.requesterId === currentUserId) {
      return <button className="button button-small button-ghost" disabled={Boolean(pendingKey)} onClick={() => updateFriendship(person.friendshipId!, "cancel")}>Отменить запрос</button>;
    }
    return (
      <div className="friend-card-actions">
        <button className="button button-small" disabled={Boolean(pendingKey)} onClick={() => updateFriendship(person.friendshipId!, "accept")}>Принять</button>
        <button className="button button-small button-ghost" disabled={Boolean(pendingKey)} onClick={() => updateFriendship(person.friendshipId!, "decline")}>Отклонить</button>
      </div>
    );
  }

  function personCard(person: FriendPerson) {
    return (
      <article className="friend-card" key={`${person.id}:${person.friendshipId ?? "new"}`}>
        <PersonAvatar person={person} />
        <div className="friend-card-copy">
          <h3>{person.displayName}</h3>
          <p>{person.city}</p>
          {person.friendshipStatus === "accepted" && <small>У вас в друзьях</small>}
          {person.friendshipStatus === "pending" && person.requesterId === currentUserId && <small>Запрос отправлен</small>}
          {person.friendshipStatus === "pending" && person.requesterId !== currentUserId && <small>Хочет добавить вас в друзья</small>}
        </div>
        {actions(person)}
      </article>
    );
  }

  return (
    <div className="friends-workspace">
      {error && <p className="form-error" role="alert">{error}</p>}
      {pendingKey && <p className="subtle" role="status">Обновляем список друзей…</p>}

      <section className="panel friends-search-panel" aria-labelledby="friends-search-title">
        <div>
          <p className="eyebrow">Поиск людей</p>
          <h2 id="friends-search-title">Найдите друзей по городу</h2>
          <p>Поиск доступен по городам, которые пользователи указали в своих профилях.</p>
        </div>
        <form className="friends-search-form" method="get">
          <label>
            <span>Город</span>
            <input name="city" defaultValue={searchAttempted ? searchCity : currentUserCity} minLength={2} maxLength={120} required placeholder="Например: Казань" autoComplete="address-level2" />
          </label>
          <button className="button" type="submit">Найти</button>
        </form>
      </section>

      {incomingRequests.length > 0 && (
        <section className="friends-section" aria-labelledby="incoming-title">
          <div className="section-heading compact"><h2 id="incoming-title">Входящие запросы</h2><span>{incomingRequests.length}</span></div>
          <div className="friends-list">{incomingRequests.map(personCard)}</div>
        </section>
      )}

      <section className="friends-section" aria-labelledby="search-results-title">
        <div className="section-heading compact"><h2 id="search-results-title">Результаты поиска</h2>{searchValid && <span>{searchResults.length}</span>}</div>
        {!searchAttempted && <div className="empty-state"><span>⌖</span><h3>Укажите город</h3><p>Введите не менее двух символов, чтобы найти людей.</p></div>}
        {searchAttempted && !searchValid && <p className="form-error" role="alert">Введите не менее двух символов названия города.</p>}
        {searchValid && searchResults.length === 0 && <div className="empty-state"><span>♡</span><h3>Никого не нашли</h3><p>Попробуйте другое написание города.</p></div>}
        {searchResults.length > 0 && <div className="friends-list">{searchResults.map(personCard)}</div>}
      </section>

      <section className="friends-section" aria-labelledby="friends-list-title">
        <div className="section-heading compact"><h2 id="friends-list-title">Мои друзья</h2><span>{friends.length}</span></div>
        {friends.length > 0 ? <div className="friends-list">{friends.map(personCard)}</div> : <div className="empty-state"><span>♡</span><h3>Список друзей пока пуст</h3><p>Найдите людей из вашего города и отправьте первый запрос.</p></div>}
      </section>
    </div>
  );
}
