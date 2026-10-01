"""Build spoken prompts locally with espeak-ng; no paid speech service."""
import argparse
import audioop
from pathlib import Path
import subprocess
import tempfile
import wave
from build_phone_config import PROMPTS


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    for name,text in PROMPTS.items():
        target=output/(name+'.wav')
        if target.exists():raise ValueError('Existing prompts are never overwritten: '+name)
        with tempfile.TemporaryDirectory() as directory:
            original=Path(directory)/'speech.wav'
            subprocess.run(['espeak-ng','-v','en-gb','-s','145','-w',str(original),text],check=True,timeout=20)
            with wave.open(str(original),'rb') as source:
                if source.getnchannels()!=1 or source.getsampwidth()!=2:raise ValueError('Unexpected speech format.')
                samples,_=audioop.ratecv(source.readframes(source.getnframes()),2,1,source.getframerate(),8000,None)
            with wave.open(str(target),'wb') as destination:
                destination.setnchannels(1);destination.setsampwidth(2);destination.setframerate(8000);destination.writeframes(samples)
        target.chmod(0o644)
    print('Four spoken phone prompts generated in mono 8kHz WAV. No live phone routes changed.')


if __name__=='__main__':main()
