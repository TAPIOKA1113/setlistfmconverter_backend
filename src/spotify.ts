import axios from 'axios'
import SpotifyWebApi from 'spotify-web-api-node';
import { USERNAME, CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN } from '../env';


const username = USERNAME;
const clientId = CLIENT_ID;
const clientSecret = CLIENT_SECRET;
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
    'refresh_token': REFRESH_TOKEN
}

async function refreshToken() {
    const authUrl = 'https://accounts.spotify.com/api/token';
    const response = await axios.post(authUrl, authData, { headers: authHeaders });
    accessToken = response.data.access_token;
    spotifyApi.setAccessToken(accessToken);
}


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


export async function spGetPlaylist(playlistId: string) {

    refreshToken();

    const playlist = await spotifyApi.getPlaylist(playlistId);

    return playlist
}

export async function spModSearchSong(name: string, artist: string): Promise<string> {
    refreshToken();
    const en_q = encodeURIComponent(`${name} ${artist}`);
    const q = decodeURIComponent(en_q);
    console.log(`Searching for: ${q}`);
    const data = await spotifyApi.searchTracks(q, { limit: 10, offset: 0, market: 'JP' }); // setlistfm と　livefansでマーケットは変更した方が良い
    // for (let i = 0; i < data.body.tracks!.items.length; i++) { // 検索結果をすべて表示  　
    //     console.log(data.body.tracks!.items[i].name); 
    // }
    return data.body

}
