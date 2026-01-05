import Ably from "ably";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    if (!process.env.ABLY_API_KEY) {
        return NextResponse.json({ error: "ABLY_API_KEY not configured" }, { status: 500 });
    }

    const client = new Ably.Rest(process.env.ABLY_API_KEY);

    try {
        const tokenRequestData = await client.auth.createTokenRequest({
            clientId: clientId || "anonymous"
        });
        return NextResponse.json(tokenRequestData);
    } catch (e) {
        return NextResponse.json({ error: "Failed to create token request" }, { status: 500 });
    }
}
