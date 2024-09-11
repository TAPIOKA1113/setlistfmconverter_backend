import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import axios from 'axios'
import SpotifyWebApi from 'spotify-web-api-node';
import { decode } from 'punycode';

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

var my_encodeURIComponent = (str: string) => str.replaceAll(/./g, (c) => {
	if (/[A-Za-z0-9-_.!~*'()]/u.test(c)) {
		return c;
	}

	var code_unit_value = c.charCodeAt(0);

	if (code_unit_value <= 0x007F) {
		return '%' + code_unit_value.toString(16).toUpperCase();
	} else if (code_unit_value <= 0x07FF) {
		return '%' + (((code_unit_value & 0x7c0) >> 6) | 0xc0).toString(16).toUpperCase()
			+ '%' + ((code_unit_value & 0x3f) | 0x80).toString(16).toUpperCase();
	} else if (code_unit_value <= 0xD7FF) {
		return '%' + ((code_unit_value & 0xf000) >> 12 | 0xe0).toString(16).toUpperCase()
			+ '%' + ((code_unit_value & 0xfc0) >> 6 | 0x80).toString(16).toUpperCase()
			+ '%' + (code_unit_value & 0x3f | 0x80).toString(16).toUpperCase();
	}

	// 0xD800以降は未対応
	throw new URIError();
});

export async function createSetlist(setlist: any) {

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
    const en_q = encodeURIComponent(`${name} ${artist}`);
    const q = decodeURIComponent(en_q);
    console.log(`Searching for: ${q}`);
    const data = await spotifyApi.searchTracks(q, { limit: 10, offset: 0, market: 'JP' }); // setlistfm と　livefansでマーケットは変更した方が良い
    // for (let i = 0; i < data.body.tracks!.items.length; i++) { // 検索結果をすべて表示  　
    //     console.log(data.body.tracks!.items[i].name); 
    // }
    return data.body.tracks!.items[0].id;
}

async function spAddPlaylist(playlistId: string, trackId: string): Promise<void> {
    await spotifyApi.addTracksToPlaylist(playlistId, [`spotify:track:${trackId}`]);
}

