from fastapi import FastAPI, UploadFile, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ValidationError
import os
from dotenv import load_dotenv
import pandas as pd
import numpy as np
from openai import OpenAI
import asyncio
from typing import Dict, Any, List, Optional
import logging
from urllib.parse import urlparse
import sys
from io import StringIO
import contextlib
import altair as alt
import hashlib
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()  # Load environment variables from .env file

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the static directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Load OpenAI API key
openai_api_key = os.getenv("OPENAI_API_KEY")

# Initialize OpenAI client
client = OpenAI(api_key=openai_api_key)


class PromptRequest(BaseModel):
    prompt: str


@app.post("/generate-text")
def generate_text(request: PromptRequest):
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": request.prompt},
        ],
    )
    return {"message": completion.choices[0].message.content}


# Directory where files will be saved (this directory is served statically)
UPLOAD_DIRECTORY = "static/uploads"


@app.post("/upload")
async def upload_file(file: UploadFile, request: Request):
    # print("file", file)
    if not os.path.exists(UPLOAD_DIRECTORY):
        os.makedirs(UPLOAD_DIRECTORY)

    file_path = os.path.join(UPLOAD_DIRECTORY, file.filename)

    # Save the file to the static directory
    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Dynamically get the host and scheme from the Request object
    host_url = request.url.scheme + "://" + request.headers["host"]

    # Construct the file URL dynamically
    file_url = f"{host_url}/static/uploads/{file.filename}"

    print("file_url", file_url)

    return JSONResponse({"file_url": file_url})



# print msg in red, accept multiple strings like print statement
def print_red(*strings):
    print("\033[91m" + " ".join(strings) + "\033[0m")


# print msg in blue, , accept multiple strings like print statement
def print_blue(*strings):
    print("\033[94m" + " ".join(strings) + "\033[0m")


def generate_data_profile(df):
    return {
        "rows": len(df),
        "columns": list(df.columns),
        "numeric_columns": list(df.select_dtypes(include=[np.number]).columns),
        "categorical_columns": list(df.select_dtypes(include=["object"]).columns),
        "missing_values": df.isnull().sum().to_dict(),
    }

class AnalysisQuestionRequest(BaseModel):
    data_url: str
    custom_instruction: Optional[str] = None
    insight_summary: Optional[str] = None
    kept_questions: List[str] = []
    
class AnalysisQuestions(BaseModel):
    questions: List[str]
@app.post("/generate-analysis-questions", response_model=AnalysisQuestions)
async def generate_analysis_questions(request: AnalysisQuestionRequest):
    try:
        # Calculate how many new questions to generate
        num_new_questions = 5 - len(request.kept_questions)

        if num_new_questions <= 0:
            return AnalysisQuestions(questions=request.kept_questions)
        
        # Extract filename from URL and convert to local path
        parsed_url = urlparse(request.data_url)
        file_path = os.path.join("static", "uploads", os.path.basename(parsed_url.path))

        logger.info(f"Reading from local file: {file_path}")
        df = pd.read_csv(file_path)
        
        # Generate profile
        profile = generate_data_profile(df)

        # Generate prompt for analysis questions
        prompt = f"""
        Given this dataset profile:
        - {profile['rows']} rows
        - Columns: {', '.join(profile['columns'])}
        - Numeric columns: {', '.join(profile['numeric_columns'])}
        - Categorical columns: {', '.join(profile['categorical_columns'])}
        
        Generate {num_new_questions} new analysis questions different  from these existing questions:
        {chr(10).join(f"- {q}" for q in request.kept_questions)}
        
        Following this specific instruction:{request.custom_instruction if request.custom_instruction else ''}
        
        {f'Based on these previous insights: {request.insight_summary}' if request.insight_summary else ''}
        
        Return only the new questions, one per line.
        """
        
        logger.info(f"Prompt: {prompt}")

        # Add timeout for OpenAI request
        try:
            async with asyncio.timeout(30):
                response = await asyncio.to_thread(
                    client.beta.chat.completions.parse,
                    model="gpt-4o-mini",
                    response_format=AnalysisQuestions,
                    messages=[
                        {
                            "role": "system",
                            "content": "You are a data analysis expert.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408, detail="OpenAI API timeout")

        return response.choices[0].message.parsed

    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class AnalysisRequest(BaseModel):
    data_url: str
    questions: List[str]


@contextlib.contextmanager
def capture_stdout():
    """Capture stdout and return it as a string"""
    stdout = StringIO()
    old_stdout = sys.stdout
    sys.stdout = stdout
    try:
        yield stdout
    finally:
        sys.stdout = old_stdout


# Create a helper function to format results
def format_results(results):
    formatted = []
    for r in results:
        formatted.append(f"Question: {r['question']}")
        formatted.append(f"Results: {r['output']}")
    return "\n".join(formatted)


@app.post("/analyze-insights")
async def analyze_insights(request: AnalysisRequest):
    try:
        parsed_url = urlparse(request.data_url)
        file_path = os.path.join("static", "uploads", os.path.basename(parsed_url.path))
        df = pd.read_csv(file_path)

        # Generate code for all questions in one prompt
        plan_prompt = f"""
        Dataset columns: {', '.join(df.columns)}
        
        Write Python code using pandas to answer each question below. 
        Do not use other external packages. 
        Do not use charts and graphs as we will only use text responses.
        Use 'df' as the DataFrame variable name as we already loaded the data for you.
        Use 'pd' as the pandas library alias.
        For each question, return a code block marked with ```python.
        Each code block should print its results clearly.
        
        Questions:
        {chr(10).join(f"{i+1}. {q}" for i, q in enumerate(request.questions))}
        """

        async with asyncio.timeout(30):
            plan_response = await asyncio.to_thread(
                client.chat.completions.create,
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a data analysis expert."},
                    {"role": "user", "content": plan_prompt},
                ],
            )

        # Parse code blocks from response
        response_text = plan_response.choices[0].message.content
        code_blocks = [block.strip() for block in response_text.split("```python")[1:]]
        code_blocks = [block.split("```")[0].strip() for block in code_blocks]

        # Execute each code block
        all_results = []
        for question, code in zip(request.questions, code_blocks):
            logger.info(f"analyze_insights::Executing code for question: {question}")
            logger.info(f"analyze_insights::Code: {code}")
            with capture_stdout() as output:
                try:
                    exec(code, {"df": df, "pd": pd})
                    all_results.append(
                        {
                            "question": question,
                            "code": code,
                            "output": output.getvalue(),
                        }
                    )
                except Exception as e:
                    all_results.append(
                        {
                            "question": question,
                            "code": code,
                            "output": f"Error: {str(e)}",
                        }
                    )

        # Generate comprehensive summary
        summary_prompt = f"""
        Analyze these results and provide a concise summary addressing all questions:

        {format_results(all_results)}

        Provide a clear, structured summary that:
        1. Addresses each question
        2. Connects insights across questions
        3. Highlights key patterns and relationships
        4. Suggests potential next steps
        """

        async with asyncio.timeout(30):
            summary_response = await asyncio.to_thread(
                client.chat.completions.create,
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a data analyst providing comprehensive insights.",
                    },
                    {"role": "user", "content": summary_prompt},
                ],
            )

        return {
            "results": all_results,
            "summary": summary_response.choices[0].message.content.strip(),
        }

    except Exception as e:
        logger.error(f"Error analyzing insights: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# main.py
class StoryOutlineRequest(BaseModel):
    summary: str


class SectionOutline(BaseModel):
    text: str
    chart: str


class StoryOutline(BaseModel):
    title: str
    sections: List[SectionOutline]


@app.post("/generate-story-outline", response_model=StoryOutline)
async def generate_story_outline(request: StoryOutlineRequest):
    try:
        prompt = f"""
        Based on this data analysis summary:
        {request.summary}

        Create a data story outline. Return a JSON object with:
        - title: engaging title
        - sections: array of objects, each section with:
          - text: describe what needs to be discussed, include key numbers as needed
          - chart: suggest a supporting chart, only if needed

        For the chart suggestion, make sure to accompany detailed encoding specifications such as axes and titles.
        
        The first and last section should be about the context and conclusion respectively.
        
        Return only valid JSON, no other text.
        """

        async with asyncio.timeout(30):
            response = await asyncio.to_thread(
                client.beta.chat.completions.parse,
                model="gpt-4o-mini",
                response_format=StoryOutline,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a data storytelling expert.",
                    },
                    {"role": "user", "content": prompt},
                ],
            )

        return response.choices[0].message.parsed

    except Exception as e:
        logger.error(f"Error generating story outline: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

#==============================================================================
def derive_info(row, df):
    col = row["Column name"]
    dtype = df[col].dtype
    
    # Handle categorical-like types
    if dtype in ["object", "bool", "category"]:
        return df[col].value_counts().to_dict()
        
    # Handle numeric types
    if dtype in ["int64", "float64"]:
        return df[col].describe().to_dict()
        
    # Handle time-related types
    if "datetime" in dtype or "timedelta" in dtype or dtype in ["period", "interval"]:
        label = dtype.name if hasattr(dtype, 'name') else str(dtype)
        return {
            f"Min {label}": df[col].min(),
            f"Max {label}": df[col].max()
        }
    return "No additional information"

def get_data_overview(df):
    dataset_info = df.dtypes.reset_index()
    dataset_info.columns = ["Column name", "Data type"]
    dataset_info["Info"] = dataset_info.apply(derive_info, axis=1, args=(df,))
    return dataset_info.to_markdown()

class StoryRequest(BaseModel):
    data_url: str
    outline: StoryOutline


class DataStory(BaseModel):
    title: str
    sections: List[Dict]



async def generate_section_text(section: SectionOutline, df: pd.DataFrame) -> str:
    prompt = f"""

    Write an engaging paragraph for the section text along with a section heading based on the following outline:
    {json.dumps(section.model_dump(), indent=2)}
    
    Return only the text, no JSON formatting.
    """
    
    response = await asyncio.to_thread(
        client.chat.completions.create,
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a data storytelling expert."},
            {"role": "user", "content": prompt}
        ]
    )
    
    return response.choices[0].message.content.strip()


def generate_chart_image(chart:Dict):
    # Create unique filename based on spec
    spec_hash = hashlib.md5(
        json.dumps(chart).encode()
    ).hexdigest()
    # Create directory if it doesn't exist
    os.makedirs("static/images", exist_ok=True)
    
    image_path = f"static/images/{spec_hash}.png"

    # Generate chart using Altair
    try:
        chart = alt.Chart.from_dict(chart)
        # Save chart to image
        chart.save(f"{image_path}")
        
    except Exception as e:
        logger.error(f"Error in generating chart image: {str(e)}")
        logger.error(f"Chart spec: {chart}")
        return None
    return image_path

async def generate_section_chart(section: SectionOutline, df: pd.DataFrame, file_path: str) -> Dict:
    
    
    profile = generate_data_profile(df)

    prompt = f"""
    Create a Vega-Lite chart specification for this outline item:
    {json.dumps(section.model_dump(), indent=2)}
    
    Given this dataset profile:
    - {profile['rows']} rows
    - Columns: {', '.join(profile['columns'])}
    - Numeric columns: {', '.join(profile['numeric_columns'])}
    - Categorical columns: {', '.join(profile['categorical_columns'])}
    
    Requirements:
    - Use "{file_path}" as the data source
    - Use double quotes for strings
    - Don't specify view size
    - Return only the Vega-Lite specification as JSON
    """
    # logger.info(f"Prompt for chart generation: {prompt}")
    response = await asyncio.to_thread(
        client.chat.completions.create,
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You are a data visualization expert."},
            {"role": "user", "content": prompt}
        ]
    )
    return json.loads(response.choices[0].message.content)

async def generate_section(section: SectionOutline, df: pd.DataFrame, file_path: str) -> Dict[str, Any]:
    text = await generate_section_text(section, df)
    chart = None
    chart_image = None
    if section.chart.strip():
        chart = await generate_section_chart(section, df, file_path)
        chart_image = generate_chart_image(chart)
    
    logger.info(f"Generated section text: {text}")
    logger.info(f"Generated chart spec: {chart}")
    
    return {
        "text": text,
        "chart": chart,
        "chart_image": chart_image
    }
@app.post("/generate-story", response_model=DataStory)
async def generate_story(story_request: StoryRequest, request: Request):
    try:
        parsed_url = urlparse(story_request.data_url)
        file_path = os.path.join("static", "uploads", os.path.basename(parsed_url.path))
        df = pd.read_csv(file_path)

        
        # Generate story sections
        sections = []
        for section in story_request.outline.sections:
            section = await generate_section(section, df, file_path)
            
            # fix chart data URL
            if section['chart']:
                section['chart']['data']['url'] = f"{request.url.scheme}://{request.headers['host']}/{section['chart']['data']['url']}"
            # Dynamically get the host and scheme from the Request object
            if section['chart_image']:
                host_url = request.url.scheme + "://" + request.headers["host"]
                section["chart_image"] = f"{host_url}/{section['chart_image']}"
                
            
            sections.append(section)

        
        # Construct and return the full story
        return DataStory(
            title=story_request.outline.title,
            sections=sections,
        )

        
    
    except Exception as e:
        logger.error(f"Error generating story: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
