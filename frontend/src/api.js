export async function request(path, options) {
    const response = await fetch(path, {
        ...options,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...options?.headers },
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = payload.detail;
        const message = Array.isArray(detail)
            ? detail.map((item) => item.msg).join(" ")
            : detail;
        const error = new Error(message || "La requête a échoué.");
        error.status = response.status;
        throw error;
    }
    return response.status === 204 ? null : response.json();
}