import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import axios from 'axios'
import puppeteer from 'puppeteer'
import SpotifyWebApi from 'spotify-web-api-node'
import { create } from 'domain'

const app = new Hono()

// CORSミドルウェアを追加
app.use('*', cors())

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

interface SortedElement {
  artistName: string
  position: number
  content: string
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

async function createSetlist(setlist: Setlist) {

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
  const data = await spotifyApi.searchTracks(q, { limit: 1, offset: 0, market: 'US' });
  return data.body.tracks!.items[0].id;
}

async function spAddPlaylist(playlistId: string, trackId: string): Promise<void> {
  await spotifyApi.addTracksToPlaylist(playlistId, [`spotify:track:${trackId}`]);
}


async function getVisuallySortedElements(url: string): Promise<SortedElement[] | null> {
  const browser = await puppeteer.launch({ headless: false })
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'networkidle0' })

    // Get all td elements
    const tdElements = await page.$$('td')

    // tdElements[0]がpcsl1クラスを持っていたらtrue
    const isPCSL1: boolean = await tdElements[0].evaluate((element) => {
      return element.classList.contains('pcsl1')
    })

    const artistName = await page.$('h4 > a')
    const artistNameText = await artistName?.evaluate(element => element.textContent) || "";

    const results: SortedElement[] = []

    if (isPCSL1) {

      for (const td of tdElements) {
        const topValue = await td.evaluate((element) => {
          const computedStyle = window.getComputedStyle(element)
          return computedStyle.getPropertyValue('top')
        })

        const match = topValue.match(/(\d+)px/)

        if (match) {
          const number = parseInt(match[1], 10)
          const aElement = await td.$('div > a')
          if (aElement) {
            const textContent = await aElement.evaluate(element => element.textContent)
            if (textContent) {
              results.push({ artistName: artistNameText, position: number, content: textContent.trim() })
            }
          }
        } else {
          console.log(`No number found: ${topValue}`)
        }
      }
    }
    else {
      for (const td of tdElements) {
        const aElement = await td.$('div > a')
        if (aElement) {
          const textContent = await aElement.evaluate(element => element.textContent)
          if (textContent) {
            results.push({ artistName: artistNameText, position: 0, content: textContent.trim() })
          }
        }
      }
    }

    // 1曲目から順に並び替え
    return results.sort((a, b) => a.position - b.position)

  } catch (error) {

    console.error(`An error occurred: ${error}`)
    return null

  } finally {

    await browser.close()

  }
}

app.get('/scrape/:id', async (c) => {  // LiveFansからセットリストを取得
  const id = c.req.param('id')
  const url = `https://www.livefans.jp/events/${id}`

  if (!url) {
    return c.json({ error: 'URL parameter is required' }, 400)
  }

  const sortedElements = await getVisuallySortedElements(url)



  if (sortedElements) {
    console.log(sortedElements)
    return c.json(sortedElements)
  } else {
    return c.json({ error: 'Failed to retrieve elements' }, 500)
  }
})



app.get('/api/setlist/:id', async (c) => {  // Setlist.fmからセットリストを取得
  const id = c.req.param('id')
  const url = `https://api.setlist.fm/rest/1.0/setlist/${id}`
  const headers = {
    "x-api-key": "rvH9s-nOQE4FOGgLByWj1VfmjzqIaEt5Q8wB",
    "Accept": "application/json",
    "Access-Control-Allow-Origin": "*"
  }

  try {
    const response = await axios.get(url, { headers })
    const data = response.data;

    const artistName = data.artist.name;
    const eventDate = new Date(data.eventDate.split('-').reverse().join('-'));
    const venueData = data.venue;
    const cityData = venueData.city;
    const country = cityData.country.name;
    const city = `${cityData.name}, ${country}`;
    const venue = venueData.name;
    const tourName = data.tour?.name || "";

    const setlistSongs: Song[] = [];
    let index = 0;

    data.sets.set.forEach((setData: any) => {
      setData.song.forEach((songData: any) => {
        index++;
        const songName = songData.name;
        const isTape = songData.tape || false;
        const isCover = 'cover' in songData;
        const medleyParts = songName.split(" / ");
        const isMedleyPart = medleyParts.length > 1;

        medleyParts.forEach((medleyPart: string) => {
          const originalArtist = isCover ? songData.cover.name : artistName;
          const song: Song = {
            index,
            name: medleyPart,
            artist: artistName,
            original_artist: originalArtist,
            is_tape: isTape,
            is_cover: isCover,
            is_medley_part: isMedleyPart
          };
          setlistSongs.push(song);
        });
      });
    });



    const setlist: Setlist = {
      artist_name: artistName,
      event_date: eventDate,
      location: city,
      venue: venue,
      tour_name: tourName,
      songs: setlistSongs,
    };
    
    const setlist_id = await createSetlist(setlist);

    setlist['setlist_id'] = setlist_id;

    return c.json(setlist);

  } catch (error) {
    console.error('Error fetching setlist:', error)
    return c.json({ error: 'Failed to fetch setlist' }, 500)
  }
})


const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})