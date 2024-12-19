import axios from 'axios';

const API_URL = 'http://localhost:8000';  // Replace with your FastAPI server URL if different

export const generateText = async (prompt) => {
  try {
    const response = await axios.post(`${API_URL}/generate-text`, { prompt });
    return response.data.message;
  } catch (error) {
    console.error('Error generating text:', error);
    throw error;
  }
};


export const uploadFile = async (formData) => {
  try {
    const response = await axios.post(`${API_URL}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.file_url;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};

// api.js
export const generateAnalysisQuestions = async (dataUrl, customInstruction = null, insightSummary = null, keptQuestions = []) => {
  try {
    const response = await axios.post(`${API_URL}/generate-analysis-questions`, {
      data_url: dataUrl,
      custom_instruction: customInstruction,
      insight_summary: insightSummary,
      kept_questions: keptQuestions
    });
    return response.data.questions;
  } catch (error) {
    console.error('Error generating analysis questions:', error);
    throw error;
  }
};

export const generateInsights = async (dataUrl, questions) => {
  try {
    const response = await axios.post(`${API_URL}/analyze-insights`, {
      data_url: dataUrl,
      questions: questions
    });
    return response.data;
  } catch (error) {
    console.error('Error generating insights:', error);
    throw error;
  }
};

export const generateStoryOutline = async (summary) => {
  try {
    const response = await axios.post(`${API_URL}/generate-story-outline`, { summary });
    return response.data;
  } catch (error) {
    console.error('Error generating story outline:', error);
    throw error;
  }
};

// api.js
export const generateStory = async (dataUrl, outline) => {
  try {
    const response = await axios.post(`${API_URL}/generate-story`, {
      data_url: dataUrl,
      outline: outline
    });
    return response.data;
  } catch (error) {
    console.error('Error generating story:', error);
    throw error;
  }
};