import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import axios from 'axios'
import SpotifyWebApi from 'spotify-web-api-node';

interface Song {
    index: number;
    name: string;
    artist: string;
    original_artist: string;
    is_tape: boolean;
    is_cover: boolean;
    is_medley_part: boolean;
}

interface Setlist {
    artist_name: string;
    event_date: Date;
    location: string;
    venue: string;
    tour_name: string;
    songs: Song[];
    setlist_id?: string;
}


const username = 'gnti7y5zkih9elje0lzd4b84g';
const clientId = '7ca33bfaf9ce41fbbc43a2abeec4e53d';
const clientSecret = '79b0572f34084761b508cbca34bd3512';
let accessToken = '';

const spotifyApi = new SpotifyWebApi({
    clientId: clientId,
    clientSecret: clientSecret,
    redirectUri: 'http://localhost:3000'
});

const authEncoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
const authHeaders = {
    'Authorization': `Basic ${authEncoded}`,
    'Content-Type': 'application/x-www-form-urlencoded'
};
const authData = {
    'grant_type': 'refresh_token',
    'refresh_token': 'AQDbn04HT4tNMovNt2r3j_xiNOz2qJPXrsIszfJEH7MfEQCR2ZBGsk9vrBeYosvqfy92UM2ciFLONzwd3K8J63wklBh9NBGfIypgOg-wgRpjGiYuPYD6gc933gNR_TpnhNU'
};

export async function createSetlist(setlist: Setlist) {

    try {
        const authUrl = 'https://accounts.spotify.com/api/token';
        const response = await axios.post(authUrl, authData, { headers: authHeaders });
        accessToken = response.data.access_token;
        spotifyApi.setAccessToken(accessToken);

        const datePart = setlist.event_date.toISOString().split('T')[0];

        const playlist = await spotifyApi.createPlaylist(username, {
            name: `${setlist.artist_name} ${setlist.tour_name} (${datePart})`,
            public: true
        });

        for (const song of setlist.songs) {
            const trackId = await spSearchSong(song.name, song.original_artist);
            await spAddPlaylist(playlist.body.id, trackId);
        }

        console.log(`Playlist created: https://open.spotify.com/playlist/${playlist.body.id}`);
        return playlist.body.id;

    } catch (error) {
        console.error('Error submitting setlist:', error);
    }
}

async function spSearchSong(name: string, artist: string): Promise<string> {
    const q = `${encodeURIComponent(name)} ${encodeURIComponent(artist)}`;
    const data = await spotifyApi.searchTracks(q, { limit: 2, offset: 0, market: 'US' }); // setlistfm と　livefansでマーケットは変更した方が良い
    console.log(data.body.tracks!.items[0].artists); // 2番目の曲名を表示
    return data.body.tracks!.items[0].id;
}

async function spAddPlaylist(playlistId: string, trackId: string): Promise<void> {
    await spotifyApi.addTracksToPlaylist(playlistId, [`spotify:track:${trackId}`]);
}

