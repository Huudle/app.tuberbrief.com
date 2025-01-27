import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

// This function uses a Python CLI called "youtube-transcript-api"
// This CLI is installed on the server and called as a subprocess
export const transcriptApi = async (videoId: string): Promise<string> => {
  try {
    const { stdout, stderr } = await execAsync(
      `youtube_transcript_api ${videoId}`
    );
    if (stderr) {
      console.error("Transcript API stderr:", stderr);
    }
    return stdout || "";
  } catch (error) {
    console.error("Transcript API error:", error);
    return "";
  }
};

// The result of this function is a string of the transcript like this:
/*
[[{'duration': 4.12,
   'start': 1.0,
   'text': 'hey guys how you doing uncle Steph here'},
  {'duration': 5.641,
   'start': 2.679,
   'text': 'so I saw a part of an interview somebody'},
  {'duration': 4.72, 'start': 5.12, 'text': "sent me a clip of uh everybody's"},
  {'duration': 3.56, 'start': 8.32, 'text': 'favorite nerd'},
  {'duration': 5.24, 'start': 9.84, 'text': 'Zuckerberg from'},
  {'duration': 6.159,
   'start': 11.88,
   'text': "meta AKA Facebook so he's on Rogan he's"},
  {'duration': 6.039,
   'start': 15.08,
   'text': "saying that by 2025 they think they're"},
  {'duration': 4.721,
   'start': 18.039,
   'text': "going to have an AI that's good enough"},
  {'duration': 4.0, 'start': 21.119, 'text': 'to replace'},
  {'duration': 5.2, 'start': 22.76, 'text': "midlevel developers that's an"},
  {'duration': 4.4,
   'start': 25.119,
   'text': 'interesting point of conversation so'},
  {'duration': 4.759,
   'start': 27.96,
   'text': "let's just jump into it so I'll give you"},
  {'duration': 5.001,
   'start': 29.519,
   'text': 'the B points the bullet points and then'},
  {'duration': 3.321,
   'start': 32.719,
   'text': "I'll go into my conversations because I"},
  {'duration': 3.76,
   'start': 34.52,
   'text': 'know some people got to go play Call of'},
  {'duration': 6.199, 'start': 36.04, 'text': 'Duty so mid'},
  {'duration': 5.88,
   'start': 38.28,
   'text': '2025 or 2025 Zucker believes that the'},
  {'duration': 3.761,
   'start': 42.239,
   'text': 'mid level developers well at least they'},
  {'duration': 4.559,
   'start': 44.16,
   'text': 'will have an AI that can do it he says'},
  {'duration': 5.12,
   'start': 46.0,
   'text': "it's very expensive right now I guess"},
  {'duration': 4.121,
   'start': 48.719,
   'text': "the CPU Cycles so it's they're going to"},
  {'duration': 4.48,
   'start': 51.12,
   'text': "have to ramp it up but it's coming I"},
  {'duration': 4.76,
   'start': 52.84,
   'text': 'noticed playing with GPT and grock I'},
  {'duration': 6.32,
   'start': 55.6,
   'text': 'knows like grock is much faster I think'},
  {'duration': 6.24,
   'start': 57.6,
   'text': "elon's new uh AI superc computers there"},
  {'duration': 4.76,
   'start': 61.92,
   'text': "it's running pretty good it's running"},
  {'duration': 2.84, 'start': 63.84, 'text': 'pretty good'}]]
  */

/*
  interface Transcript {
  duration: number;
  start: number;
  text: string;
}

interface TranscriptResult {
  transcript: Transcript[];
}

const calculateVideoDuration = (transcript: TranscriptResult): number => {
  return transcript.transcript.reduce((acc, curr) => acc + curr.duration, 0);
};
*/
