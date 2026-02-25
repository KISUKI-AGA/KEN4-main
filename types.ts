export interface Question {
  id: number;
  text: string;
  image_filename: string;
  ruby_text?: string;
}

export interface User {
  id: number;
  name: string;
  avatar: string;
  grade: string;
  gender: string;
}

export interface Response {
  id?: number;
  user_id: number;
  question_id: number;
  score: number;
  timestamp: string;
}

export interface AdminResponseView {
  user_id: number;
  user_name: string;
  user_avatar: string;
  user_grade: string;
  user_gender: string;
  question_id: number;
  question_text: string;
  score: number;
  timestamp: string;
}

export enum AppState {
  PROFILE = 'PROFILE',
  QUIZ = 'QUIZ',
  COMPLETED = 'COMPLETED',
  ADMIN = 'ADMIN'
}
