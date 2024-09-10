import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import axios from 'axios'
import * as cheerio from 'cheerio';
import { chromium } from 'playwright'
import puppeteer from 'puppeteer'

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
}

interface SortedElement {
  position: number
  content: string
}

async function getVisuallySortedElements(url: string): Promise<SortedElement[] | null> { // 高さを取得する必要のあるセットリスト
  const browser = await puppeteer.launch({ headless: false })
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'networkidle0' })

    // Get all td elements
    const tdElements = await page.$$('td')

    // tdElements[0]がpcsl1クラスを持っていたらtrue
    const isPCSL1 = await tdElements[0].evaluate((element) => {
      return element.classList.contains('pcsl1')
    })

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
              results.push({ position: number, content: textContent.trim() })
            }
          }
        } else {
          console.log(`No number found: ${topValue}`)
        }
      }
    } 
    else 
    {
        for (const td of tdElements) {
          const aElement = await td.$('div > a')
          if (aElement) {
            const textContent = await aElement.evaluate(element => element.textContent)
            if (textContent) {
              results.push({ position: 0, content: textContent.trim() })
            }
          }
        }
    }

    // Sort results by position
    return results.sort((a, b) => a.position - b.position)
  } catch (error) {
    console.error(`An error occurred: ${error}`)
    return null
  } finally {
    await browser.close()
  }
}

app.get('/scrape/:id', async (c) => {
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



app.get('/api/setlist/:id', async (c) => {
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
      songs: setlistSongs
    };

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